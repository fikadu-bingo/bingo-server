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

// In-memory games store, keyed by composite gameId like 'stake10_round1'
const activeGames = {};
// Track current round number per stake (e.g. { "10": 1, "20": 3 })
const currentRoundByStake = {};

// Utility to build gameId string from stake and round
function getGameId(stake, round) {
  return `stake${stake}_round${round}`;
}

// Create or get game instance for a stake and round
function createOrGetGame(stake, round) {
  const gameId = getGameId(stake, round);
  if (!activeGames[gameId]) {
    activeGames[gameId] = {
      players: [],        // [{ socketId, userId, username }]
      tickets: {},        // { userId: [numbers...] }
      numbersCalled: [],  // numbers called so far
      state: "waiting",   // waiting | countdown | started | ended
      countdown: 50,      // countdown seconds
      stakePerPlayer: stake,
      intervalId: null,
      currentCountdown: 50,
    };
  }
  return activeGames[gameId];
}

// Broadcast players info for a gameId
function broadcastPlayerInfo(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  const players = game.players;
  const count = players.length;

  io.to(gameId).emit("playerListUpdated", { players, count });
  io.to(gameId).emit("playerCountUpdate", count);

  // Global broadcast for homepage to show counts of all games
  io.emit("stakePlayerCount", { gameId, count });
}

// Broadcast win amount for a gameId (80% total stake)
function broadcastWinAmount(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  const stake = Number(game.stakePerPlayer) || 0;
  const totalStake = stake * game.players.length;
  const winAmount = Math.floor(totalStake * 0.8);
  io.to(gameId).emit("winAmountUpdate", winAmount);
}

// Start countdown for gameId if not running
function startCountdown(gameId) {
  const game = activeGames[gameId];
  if (!game) return;
  if (game.intervalId) return; // already running

  game.state = "countdown";
  let counter = typeof game.countdown === "number" ? game.countdown : 50;
  game.currentCountdown = counter;

  game.intervalId = setInterval(() => {
    if (!activeGames[gameId]) {
      clearInterval(game.intervalId);
      return;
    }

    io.to(gameId).emit("countdownUpdate", counter);
    game.currentCountdown = counter;

    counter -= 1;if (counter < 0) {
      clearInterval(game.intervalId);
      game.intervalId = null;
      game.state = "started";
      game.currentCountdown = 0;

      // Broadcast countdown finished and game started
      io.to(gameId).emit("countdownUpdate", 0);
      io.to(gameId).emit("gameStarted");

      // Automatically create the next round game instance for this stake
      const stake = game.stakePerPlayer;
      if (stake) {
        const currentRound = currentRoundByStake[stake] || 1;
        const nextRound = currentRound + 1;
        currentRoundByStake[stake] = nextRound;
        createOrGetGame(stake, nextRound);
        // Broadcast stake player count update for the new round
        io.emit("stakePlayerCount", {
          gameId: getGameId(stake, nextRound),
          count: 0,
        });
      }
    }
  }, 1000);
}

// Stop and reset countdown for gameId
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

  // Join a game by stake and userId (username optional)
  // Expect: { stake, userId, username }
  socket.on("joinGame", ({ stake, userId, username = "" } = {}) => {
    if (!stake || !userId) {
      return socket.emit("error", { message: "joinGame requires stake and userId" });
    }

    // Get current round for this stake, or start from 1
    let round = currentRoundByStake[stake] || 1;

    let gameId = getGameId(stake, round);
    let game = activeGames[gameId];

    // If no game exists or game is started or ended, move to next round
    if (!game || game.state === "started" || game.state === "ended") {
      round += 1;
      currentRoundByStake[stake] = round;
      gameId = getGameId(stake, round);
      game = createOrGetGame(stake, round);
    }

    // Remove duplicate player entries for userId
    game.players = game.players.filter((p) => p.userId !== userId);

    // Add player to the game
    game.players.push({ socketId: socket.id, userId, username });

    socket.join(gameId);
    console.log(`✅ User ${userId} (${socket.id}) joined game ${gameId}`);

    // Broadcast updates
    broadcastPlayerInfo(gameId);
    broadcastWinAmount(gameId);

    // Start countdown if 2+ players and waiting state
    if (game.players.length >= 2 && game.state === "waiting") {
      startCountdown(gameId);
    } else if (game.state === "countdown") {
      // Send current countdown to new player joining countdown
      socket.emit("countdownUpdate", game.currentCountdown);
    }

    // Emit current game state to this socket
    socket.emit("gameStateUpdate", { state: game.state, countdown: game.currentCountdown });
  });

  // Leave game by stake and userId
  socket.on("leaveGame", ({ stake, userId } = {}) => {
    if (!stake || !userId) return;

    // Find all rounds for stake, remove player from any active games they are in
    const rounds = currentRoundByStake[stake] || 1;
    for (let round = 1; round <= rounds; round++) {
      const gameId = getGameId(stake, round);
      const game = activeGames[gameId];
      if (!game) continue;

      // Remove player by socketId or userId
      const beforeCount = game.players.length;
      game.players = game.players.filter(p => p.socketId !== socket.id && p.userId !== userId);
      socket.leave(gameId);

      if (game.players.length !== beforeCount) {
        // Cleanup if empty
        if (game.players.length === 0) {
          if (game.intervalId) clearInterval(game.intervalId);
          delete activeGames[gameId];io.emit("stakePlayerCount", { gameId, count: 0 });
          console.log(`🗑 Game ${gameId} deleted (empty).`);
        } else {
          // Stop countdown if players less than 2
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

  // Select ticket number for user in a game
  socket.on("selectTicketNumber", ({ stake, round, userId, number } = {}) => {
    if (!stake || !round || !userId) return;

    const gameId = getGameId(stake, round);
    const game = activeGames[gameId];
    if (!game) return;

    if (!game.tickets[userId]) game.tickets[userId] = [];
    if (!game.tickets[userId].includes(number)) {
      game.tickets[userId].push(number);
    }

    io.to(gameId).emit("ticketNumbersUpdated", game.tickets);
  });

  // Caller calls a number
  socket.on("callNumber", ({ stake, round, number } = {}) => {
    if (!stake || !round) return;

    const gameId = getGameId(stake, round);
    const game = activeGames[gameId];
    if (!game) return;

    if (!game.numbersCalled.includes(number)) {
      game.numbersCalled.push(number);
      io.to(gameId).emit("numberCalled", number);
    }
  });

  // Player wins
  socket.on("bingoWin", ({ stake, round, userId } = {}) => {
    if (!stake || !round || !userId) return;

    const gameId = getGameId(stake, round);
    const game = activeGames[gameId];
    if (!game) return;

    game.state = "ended";
    io.to(gameId).emit("gameWon", { userId });

    if (game.intervalId) {
      clearInterval(game.intervalId);
      game.intervalId = null;
    }

    // Cleanup game after short delay to allow clients to see winner
    setTimeout(() => {
      if (activeGames[gameId]) {
        delete activeGames[gameId];
        io.emit("stakePlayerCount", { gameId, count: 0 });
        console.log(`♻️ Game ${gameId} has been reset.`);
      }
    }, 15000);
  });

  // Handle socket disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    // Remove socket from all games it was in
    for (const gameId of Object.keys(activeGames)) {
      const game = activeGames[gameId];
      const beforeCount = game.players.length;
      game.players = game.players.filter(p => p.socketId !== socket.id);

      if (game.players.length !== beforeCount) {
        if (game.players.length === 0) {
          if (game.intervalId) clearInterval(game.intervalId);
          delete activeGames[gameId];
          io.emit("stakePlayerCount", { gameId, count: 0 });
          console.log(`🗑 Game ${gameId} deleted (empty).`);
        } else {
          if (game.players.length < 2 && game.intervalId) {
            stopAndResetCountdown(gameId);
          }
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