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

// Single game room id
const GAME_ROOM = "bingo";

// In-memory single game state
const currentGame = {
  players: [],        // [{ socketId, userId, username }]
  tickets: {},        // { userId: [numbers...] }
  numbersCalled: [],  // numbers already called
  state: "waiting",   // waiting | countdown | started | ended
  countdown: 50,      // seconds before start
  stakePerPlayer: 0,  // set from first join or provided by joins
  countdownInterval: null,
  callerInterval: null,
  currentCountdown: 50,
};

// Utility: broadcast player info to room & homepage
function broadcastPlayerInfo() {
  const players = currentGame.players;
  io.to(GAME_ROOM).emit("playerListUpdated", { players });
  io.to(GAME_ROOM).emit("playerCountUpdate", players.length);

  // Broadcast global stake/player info for homepage compatibility
  io.emit("stakePlayerCount", { gameId: GAME_ROOM, count: players.length });
}

// Utility: broadcast win amount (80% of collected stakes)
function broadcastWinAmount() {
  const stake = Number(currentGame.stakePerPlayer) || 0;
  const totalStake = stake * currentGame.players.length;
  const winAmount = Math.floor(totalStake * 0.8);
  io.to(GAME_ROOM).emit("winAmountUpdate", winAmount);
}

// Start countdown (50s) if not already running
function startCountdownIfNeeded() {
  if (currentGame.countdownInterval) return; // already running
  if (currentGame.state !== "waiting") return;

  currentGame.state = "countdown";
  let counter = typeof currentGame.countdown === "number" ? currentGame.countdown : 50;
  currentGame.currentCountdown = counter;

  io.to(GAME_ROOM).emit("countdownUpdate", counter);

  currentGame.countdownInterval = setInterval(() => {
    // if players dropped below 2, stop countdown and reset
    if (currentGame.players.length < 2) {
      clearInterval(currentGame.countdownInterval);
      currentGame.countdownInterval = null;
      currentGame.state = "waiting";
      currentGame.countdown = 50;
      currentGame.currentCountdown = 50;
      io.to(GAME_ROOM).emit("countdownStopped", currentGame.currentCountdown);
      return;
    }
    counter -= 1;
    currentGame.currentCountdown = counter;
    // broadcast updated value
    io.to(GAME_ROOM).emit("countdownUpdate", counter);
    if (counter < 0) {
      // countdown finished -> start game
      clearInterval(currentGame.countdownInterval);
      currentGame.countdownInterval = null;
      currentGame.state = "started";
      currentGame.currentCountdown = 0;

      io.to(GAME_ROOM).emit("countdownUpdate", 0);
      io.to(GAME_ROOM).emit("gameStarted");

      // Kick off automatic caller
      startCallingNumbers();
    }
  }, 1000);
}

// Stop countdown if running and reset
function stopAndResetCountdown() {
  if (currentGame.countdownInterval) {
    clearInterval(currentGame.countdownInterval);
    currentGame.countdownInterval = null;
  }
  currentGame.state = "waiting";
  currentGame.countdown = 50;
  currentGame.currentCountdown = 50;
  io.to(GAME_ROOM).emit("countdownStopped", currentGame.currentCountdown);
}

// Start automatically calling numbers every 3 seconds (until all numbers called or game ends)
function startCallingNumbers() {
  // If already calling, don't start another
  if (currentGame.callerInterval) return;

  // Safety: if numbersCalled length is 100 already, don't start
  if (currentGame.numbersCalled.length >= 100) return;

  currentGame.callerInterval = setInterval(() => {
    // safety: stop if game not in started state
    if (currentGame.state !== "started") {
      clearInterval(currentGame.callerInterval);
      currentGame.callerInterval = null;
      return;
    }

    // pick a random number from 1..100 not in numbersCalled
    let tries = 0;
    let newNumber = null;
    while (tries < 500) {
      const candidate = Math.floor(Math.random() * 100) + 1;
      if (!currentGame.numbersCalled.includes(candidate)) {
        newNumber = candidate;
        break;
      }
      tries++;
    }

    if (newNumber === null) {
      // all numbers exhausted
      clearInterval(currentGame.callerInterval);
      currentGame.callerInterval = null;
      // End game as draw
      currentGame.state = "ended";
      io.to(GAME_ROOM).emit("gameEnded", { reason: "noNumbersLeft" });
      // reset after short delay
      setTimeout(resetGame, 5000);
      return;
    }

    currentGame.numbersCalled.push(newNumber);
    io.to(GAME_ROOM).emit("numberCalled", newNumber);
  }, 3000); // call every 3s (tweakable)
}

// Stop caller interval
function stopCallingNumbers() {
  if (currentGame.callerInterval) {
    clearInterval(currentGame.callerInterval);
    currentGame.callerInterval = null;
  }
}

// Reset game state to waiting (clears tickets & numbers but keeps players array empty)
function resetGame() {
  stopCallingNumbers();
  stopAndResetCountdown();

  // Clear state except players (keep empty)
  currentGame.players = [];
  currentGame.tickets = {};
  currentGame.numbersCalled = [];
  currentGame.state = "waiting";
  currentGame.countdown = 50;
  currentGame.currentCountdown = 50;
  currentGame.stakePerPlayer = 0;

  // Notify homepage that room is reset
  io.emit("stakePlayerCount", { gameId: GAME_ROOM, count: 0 });
  io.to(GAME_ROOM).emit("gameReset");
}

// Socket handlers
io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Join game
  // payload: { userId, username, stake (optional) }
  socket.on("joinGame", ({ userId, username = "Player", stake } = {}) => {
    if (!userId) {
      return socket.emit("error", { message: "joinGame requires userId" });
    }

    // Add or update stakePerPlayer if provided (if not set yet)
    if (stake && !currentGame.stakePerPlayer) {
      currentGame.stakePerPlayer = Number(stake);
    }

    // Remove duplicate entry for same userId (reconnect)
    currentGame.players = currentGame.players.filter((p) => p.userId !== userId);

    currentGame.players.push({ socketId: socket.id, userId, username });

    socket.join(GAME_ROOM);
    console.log(`✅ User ${userId} (${socket.id}) joined ${GAME_ROOM}`);

    // Broadcast updates
    broadcastPlayerInfo();
    broadcastWinAmount();
    // Start countdown if enough players
    if (currentGame.players.length >= 2 && currentGame.state === "waiting") {
      startCountdownIfNeeded();
    } else if (currentGame.state === "countdown") {
      // provide current countdown to newcomer
      socket.emit("countdownUpdate", currentGame.currentCountdown);
    }

    // Emit state to new client
    socket.emit("gameStateUpdate", { state: currentGame.state, countdown: currentGame.currentCountdown });
  });

  // Leave game
  // payload: { userId }
  socket.on("leaveGame", ({ userId } = {}) => {
    if (!userId) return;

    const before = currentGame.players.length;
    currentGame.players = currentGame.players.filter((p) => p.socketId !== socket.id && p.userId !== userId);
    socket.leave(GAME_ROOM);

    if (currentGame.players.length !== before) {
      // If players remain > 0 but at least one remains, we may need to deduct leaver's balance
      if (before > 1) {
        // There were multiple players before leave — apply penalty to leaver
        // Inform only the leaving socket to deduct balance (clients should call API to update DB)
        socket.emit("deductBalance", { amount: currentGame.stakePerPlayer || 0, reason: "leftDuringGame" });
      }

      // If players dropped below 2 and countdown is running, stop & reset
      if (currentGame.players.length < 2 && currentGame.countdownInterval) {
        stopAndResetCountdown();
      }

      // If no players left -> reset game completely
      if (currentGame.players.length === 0) {
        resetGame();
      } else {
        broadcastPlayerInfo();
        broadcastWinAmount();
      }
    }
  });

  // Select ticket number
  // payload: { userId, number }
  socket.on("selectTicketNumber", ({ userId, number } = {}) => {
    if (!userId || typeof number !== "number") return;

    if (!currentGame.tickets[userId]) currentGame.tickets[userId] = [];
    if (!currentGame.tickets[userId].includes(number)) {
      currentGame.tickets[userId].push(number);
    }

    // Broadcast the tickets map to all clients in the room
    io.to(GAME_ROOM).emit("ticketNumbersUpdated", currentGame.tickets);
  });

  // Caller or server can emit a manual callNumber too; we accept it
  // payload: { number }  (server-client or admin/driver)
  socket.on("callNumber", ({ number } = {}) => {
    if (typeof number !== "number") return;
    if (!currentGame.numbersCalled.includes(number)) {
      currentGame.numbersCalled.push(number);
      io.to(GAME_ROOM).emit("numberCalled", number);
    }
  });

  // Bingo win reported by a client
  // payload: { userId }
  socket.on("bingoWin", ({ userId } = {}) => {
    if (!userId) return;

    // Only process if game started
    if (currentGame.state !== "started") return;

    currentGame.state = "ended";
    io.to(GAME_ROOM).emit("gameWon", { userId });

    // stop auto-caller
    stopCallingNumbers();

    // Compute prize: 80% of total stakes
    const stake = Number(currentGame.stakePerPlayer) || 0;
    const totalStake = stake * currentGame.players.length;
    const prize = Math.floor(totalStake * 0.8);

    // Build losers array (all players except winner)
    const losers = currentGame.players.map((p) => p.userId).filter(id => id !== userId);

    // Emit balance change instructions (clients should call backend APIs to persist)
    io.to(GAME_ROOM).emit("balanceChange", {
      winner: userId,
      prize,
      losers,
      perLoserDeduct: stake,
      totalCollected: totalStake,
    });

    // Keep the winner visible for some time, then reset the game
    setTimeout(() => {
      resetGame();
    }, 15000);
  });

  // handle disconnect similar to leave (but we'll treat disconnect as leave without immediate penalty
  // unless there were multiple players -> then we emit deductBalance to that socket (not guaranteed because disconnected)
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const before = currentGame.players.length;
    currentGame.players = currentGame.players.filter((p) => p.socketId !== socket.id);
    if (currentGame.players.length !== before) {
      // If players dropped below 2 and countdown running, stop & reset
      if (currentGame.players.length < 2 && currentGame.countdownInterval) {
        stopAndResetCountdown();
      }

      if (currentGame.players.length === 0) {
        resetGame();
      } else {
        broadcastPlayerInfo();
        broadcastWinAmount();
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