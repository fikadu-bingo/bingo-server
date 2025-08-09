const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
require("./models/cashout");
require("./models/promocode");
const cors = require("cors");
const path = require("path");

const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");
const userRoutes = require("./routes/user");
const agentRoutes = require("./routes/agentRoutes");
const promocodeRoutes = require('./routes/promocode');
const promoterRoutes = require('./routes/promoter');
const agentAuthRoutes = require('./routes/agent');

const app = express();
const server = http.createServer(app);

// Replace with your frontend origin or use env var
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://bingo-telegram-web.vercel.app";

// --------------------
// Setup CORS & body parser
// --------------------
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agent", agentAuthRoutes);
app.use("/api/promocode", promocodeRoutes);
app.use("/api/promoter", promoterRoutes);

// Root
app.get("/", (req, res) => {
  res.send("✅ Bingo server is running!");
});

// --------------------
// Socket.IO
// --------------------
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// In-memory games store
const activeGames = {};

/**
 * Helper: create game if missing
 */
function createGame(gameId, stake = 0) {
  if (!activeGames[gameId]) {
    activeGames[gameId] = {
      players: [], // [{ socketId, userId, username }]
      tickets: {}, // { userId: [numbers...] }
      numbersCalled: [],
      state: "waiting", // waiting | countdown | started | ended
      countdown: 50, // default countdown seconds
      stakePerPlayer: stake || 0,
      intervalId: null,
      currentCountdown: 50, // track current countdown value for sync
    };
  }
}

/**
 * Helper: broadcast player info to room and globally for homepage
 */
function broadcastPlayerInfo(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  const players = game.players;
  const count = players.length;

  // To all in the stake room
  io.to(gameId).emit("playerListUpdated", { players, count });
  io.to(gameId).emit("playerCountUpdate", count);

  // Global broadcast for homepage to show counts of all games
  io.emit("stakePlayerCount", { gameId, count });
}

/**
 * Helper: broadcast win amount (80% of total stake)
 */
function broadcastWinAmount(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  const stake = Number(game.stakePerPlayer) || 0;
  const totalStake = stake * game.players.length;
  const winAmount = Math.floor(totalStake * 0.8); // 80% rule (rounded down)
  io.to(gameId).emit("winAmountUpdate", winAmount);
}

/**
 * Start centralized countdown for a game (if not already started)
 */
function startCountdown(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  if (game.intervalId) return; // already running

  game.state = "countdown";
  let counter = typeof game.countdown === "number" ? game.countdown : 50;
  game.currentCountdown = counter; // set current countdown

  game.intervalId = setInterval(() => {
    // Ensure game still exists
    if (!activeGames[gameId]) {
      clearInterval(game.intervalId);
      return;
    }

    // Broadcast current countdown
    io.to(gameId).emit("countdownUpdate", counter);

    game.currentCountdown = counter; // update current countdown

    // Decrement
    counter -= 1;// If counter < 0, finish countdown and start game
    if (counter < 0) {
      clearInterval(game.intervalId);
      game.intervalId = null;
      game.state = "started";
      game.currentCountdown = 0;
      // Broadcast countdown zero and game started event
      io.to(gameId).emit("countdownUpdate", 0);
      io.to(gameId).emit("gameStarted");
    }
  }, 1000);
}

/**
 * Stop and reset countdown for a game
 */
function stopAndResetCountdown(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  if (game.intervalId) {
    clearInterval(game.intervalId);
    game.intervalId = null;
  }
  game.state = "waiting";
  game.countdown = 50;
  game.currentCountdown = 50;
  io.to(gameId).emit("countdownStopped", game.currentCountdown);
}

io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // --- Join a game/stake group
  // payload: { gameId, userId, username?, stake? }
  socket.on("joinGame", ({ gameId, userId, username = "", stake = 0 } = {}) => {
    if (!gameId || !userId) {
      return socket.emit("error", { message: "joinGame requires gameId and userId" });
    }

    // Create game if missing and set stake if provided
    createGame(gameId, stake);

    const game = activeGames[gameId];

    // If stake provided and not set yet, set it (first-join sets stake)
    if (stake && !game.stakePerPlayer) {
      game.stakePerPlayer = stake;
    }

    // Remove previous entry for same user (handle reconnect)
    game.players = game.players.filter((p) => p.userId !== userId);

    // Add current player
    game.players.push({ socketId: socket.id, userId, username });

    socket.join(gameId);
    console.log(`✅ User ${userId} (${socket.id}) joined game ${gameId}`);

    // Broadcast updates
    broadcastPlayerInfo(gameId);
    broadcastWinAmount(gameId);

    // Start countdown once we have at least 2 players and game is waiting
    if (game.players.length >= 2 && game.state === "waiting") {
      startCountdown(gameId);
    } else if (game.state === "countdown") {
      // If countdown already started, send current countdown to new user
      socket.emit("countdownUpdate", game.currentCountdown);
    }

    // Also emit current game state to new user
    socket.emit("gameStateUpdate", { state: game.state, countdown: game.currentCountdown });
  });

  // --- Leave a game explicitly
  // payload: { gameId, userId? }
  socket.on("leaveGame", ({ gameId, userId } = {}) => {
    if (!gameId || !activeGames[gameId]) return;
    const game = activeGames[gameId];

    // Remove player by socketId or userId if provided
    game.players = game.players.filter((p) => p.socketId !== socket.id && p.userId !== userId);
    socket.leave(gameId);

    // If no players -> cleanup everything
    if (game.players.length === 0) {
      if (game.intervalId) {
        clearInterval(game.intervalId);
      }
      delete activeGames[gameId];
      io.emit("stakePlayerCount", { gameId, count: 0 });
      console.log(`🗑 Game ${gameId} deleted (empty).`);
      return;
    }

    // If players dropped below 2 and a countdown was running, stop & reset
    if (game.players.length < 2 && game.intervalId) {
      stopAndResetCountdown(gameId);
    }

    // Broadcast updated info
    broadcastPlayerInfo(gameId);
    broadcastWinAmount(gameId);
  });

  // --- Select ticket numbers
  // payload: { gameId, userId, number }
  socket.on("selectTicketNumber", ({ gameId, userId, number } = {}) => {
    if (!gameId || !activeGames[gameId]) return;
    const game = activeGames[gameId];

    if (!game.tickets[userId]) game.tickets[userId] = [];
    if (!game.tickets[userId].includes(number)) {
      game.tickets[userId].push(number);
    }

    // Broadcast the ticket map to all players in the room
    io.to(gameId).emit("ticketNumbersUpdated", game.tickets);
  });// --- Caller calls a number
  socket.on("callNumber", ({ gameId, number } = {}) => {
    if (!gameId || !activeGames[gameId]) return;
    const game = activeGames[gameId];
    if (!game.numbersCalled.includes(number)) {
      game.numbersCalled.push(number);
      io.to(gameId).emit("numberCalled", number);
    }
  });

  // --- Player wins
  socket.on("bingoWin", ({ gameId, userId } = {}) => {
    if (!gameId || !activeGames[gameId]) return;
    const game = activeGames[gameId];
    game.state = "ended";
    io.to(gameId).emit("gameWon", { userId });

    // Stop any running interval
    if (game.intervalId) {
      clearInterval(game.intervalId);
      game.intervalId = null;
    }

    // Reset / cleanup after short delay so clients can see winner
    setTimeout(() => {
      if (activeGames[gameId]) {
        delete activeGames[gameId];
        io.emit("stakePlayerCount", { gameId, count: 0 });
        console.log(`♻️ Game ${gameId} has been reset.`);
      }
    }, 15000);
  });

  // --- Disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    // Remove socket from any games it was in
    for (const gameId of Object.keys(activeGames)) {
      const game = activeGames[gameId];
      const before = game.players.length;
      game.players = game.players.filter((p) => p.socketId !== socket.id);

      if (game.players.length !== before) {
        // If empty -> cleanup
        if (game.players.length === 0) {
          if (game.intervalId) clearInterval(game.intervalId);
          delete activeGames[gameId];
          io.emit("stakePlayerCount", { gameId, count: 0 });
          console.log(`🗑 Game ${gameId} deleted (empty).`);
        } else {
          // If players drop below 2 and countdown running -> stop/reset
          if (game.players.length < 2 && game.intervalId) {
            stopAndResetCountdown(gameId);
          }
          // Broadcast updates
          broadcastPlayerInfo(gameId);
          broadcastWinAmount(gameId);
        }
      }
    }
  });
});

// --------------------
// Sync DB and Start Server
// --------------------
sequelize
  .sync({ alter: true })
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to sync DB:", err);
  });