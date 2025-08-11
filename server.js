const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
const { User } = require("./models"); // Make sure User model exports correctly
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
  players: [],        // [{ userId, username, socketIds: [] }]
  tickets: {},        // { userId: [numbers...] }
  numbersCalled: [],  // numbers already called
  state: "waiting",   // waiting | countdown | started | ended
  countdown: 50,      // seconds before start
  stakePerPlayer: 0,  // set from first join or provided by joins
  countdownInterval: null,
  callerInterval: null,
  currentCountdown: 50,
};

// Map userId => { username, socketIds: Set<string> }
const playersMap = new Map();

// Utility: rebuild currentGame.players array from playersMap
function rebuildPlayersArray() {
  currentGame.players = [];
  for (const [userId, data] of playersMap.entries()) {
    currentGame.players.push({
      userId,
      username: data.username,
      socketIds: Array.from(data.socketIds),
    });
  }
}

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
  if (currentGame.callerInterval) return;
  if (currentGame.numbersCalled.length >= 100) return;

  currentGame.callerInterval = setInterval(() => {
    if (currentGame.state !== "started") {
      clearInterval(currentGame.callerInterval);
      currentGame.callerInterval = null;
      return;
    }

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
      clearInterval(currentGame.callerInterval);
      currentGame.callerInterval = null;
      currentGame.state = "ended";
      io.to(GAME_ROOM).emit("gameEnded", { reason: "noNumbersLeft" });
      setTimeout(resetGame, 5000);
      return;
    }

    currentGame.numbersCalled.push(newNumber);
    io.to(GAME_ROOM).emit("numberCalled", newNumber);
  }, 3000);
}

// Stop caller interval
function stopCallingNumbers() {
  if (currentGame.callerInterval) {
    clearInterval(currentGame.callerInterval);
    currentGame.callerInterval = null;
  }
}

// Reset game state
function resetGame() {
  stopCallingNumbers();
  stopAndResetCountdown();

  playersMap.clear();  // clear map here to avoid mismatch
  currentGame.players = [];
  currentGame.tickets = {};
  currentGame.numbersCalled = [];
  currentGame.state = "waiting";
  currentGame.countdown = 50;
  currentGame.currentCountdown = 50;
  currentGame.stakePerPlayer = 0;

  io.emit("stakePlayerCount", { gameId: GAME_ROOM, count: 0 });
  io.to(GAME_ROOM).emit("gameReset");
}

// Socket handlers
io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Join game
  socket.on("joinGame", ({ userId, username = "Player", stake } = {}) => {
    if (!userId) {
      return socket.emit("error", { message: "joinGame requires userId" });
    }

    // Update stakePerPlayer if needed
    if (stake && !currentGame.stakePerPlayer) {
      currentGame.stakePerPlayer = Number(stake);
    }

    // Add or update user in playersMap
    if (playersMap.has(userId)) {
      playersMap.get(userId).socketIds.add(socket.id);
    } else {
      playersMap.set(userId, { username, socketIds: new Set([socket.id]) });
    }

    rebuildPlayersArray();

    socket.join(GAME_ROOM);
    console.log(`✅ User ${userId} (${socket.id}) joined ${GAME_ROOM}`);

    broadcastPlayerInfo();
    broadcastWinAmount();
    if (currentGame.players.length >= 2 && currentGame.state === "waiting") {
      startCountdownIfNeeded();
    } else if (currentGame.state === "countdown") {
      socket.emit("countdownUpdate", currentGame.currentCountdown);
    }

    socket.emit("gameStateUpdate", { state: currentGame.state, countdown: currentGame.currentCountdown });
  });

  // Leave game
  socket.on("leaveGame", ({ userId } = {}) => {
    if (!userId) return;

    if (playersMap.has(userId)) {
      const userData = playersMap.get(userId);
      userData.socketIds.delete(socket.id);
      if (userData.socketIds.size === 0) {
        playersMap.delete(userId);
      }
    }

    rebuildPlayersArray();

    socket.leave(GAME_ROOM);

    broadcastPlayerInfo();
    broadcastWinAmount();

    if (currentGame.players.length < 2 && currentGame.countdownInterval) {
      stopAndResetCountdown();
    }

    if (currentGame.players.length === 0) {
      resetGame();
    }
  });

  // Select ticket number
  socket.on("selectTicketNumber", ({ userId, number } = {}) => {
    if (!userId || typeof number !== "number") return;

    if (!currentGame.tickets[userId]) currentGame.tickets[userId] = [];
    if (!currentGame.tickets[userId].includes(number)) {
      currentGame.tickets[userId].push(number);
    }

    io.to(GAME_ROOM).emit("ticketNumbersUpdated", currentGame.tickets);
  });

  // Call number manually
  socket.on("callNumber", ({ number } = {}) => {
    if (typeof number !== "number") return;
    if (!currentGame.numbersCalled.includes(number)) {
      currentGame.numbersCalled.push(number);
      io.to(GAME_ROOM).emit("numberCalled", number);
    }
  });

  // Bingo win
  socket.on("bingoWin", async ({ userId } = {}) => {
    if (!userId) return;
    if (currentGame.state !== "started") return;

    currentGame.state = "ended";
    io.to(GAME_ROOM).emit("gameWon", { userId });

    stopCallingNumbers();

    const stake = Number(currentGame.stakePerPlayer) || 0;
    const totalStake = stake * currentGame.players.length;
    const prize = Math.floor(totalStake * 0.8);

    const losers = currentGame.players.map(p => p.userId).filter(id => id !== userId);

    try {
      await sequelize.transaction(async (t) => {
        const winner = await User.findOne({ where: { id: userId }, transaction: t });
        if (!winner) throw new Error("Winner user not found");

        winner.balance = winner.balance - stake + prize;
        if (winner.balance < 0) throw new Error("Winner balance cannot be negative");
        await winner.save({ transaction: t });

        const losersRecords = await User.findAll({ where: { id: losers }, transaction: t });
        for (const loser of losersRecords) {
          loser.balance = loser.balance - stake;
          if (loser.balance < 0) loser.balance = 0;
          await loser.save({ transaction: t });
        }
      });

      const allPlayerIds = currentGame.players.map(p => p.userId);
      const allPlayers = await User.findAll({ where: { id: allPlayerIds } });
      const balances = {};
      for (const player of allPlayers) {
        balances[player.id] = player.balance;
      }
      io.to(GAME_ROOM).emit("balanceChange", { balances });

    } catch (error) {
      console.error("Error updating balances on bingoWin:", error);
    }

    setTimeout(() => {
      resetGame();
    }, 15000);
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    for (const [userId, data] of playersMap.entries()) {
      if (data.socketIds.has(socket.id)) {
        data.socketIds.delete(socket.id);
        if (data.socketIds.size === 0) {
          playersMap.delete(userId);
        }
        break;
      }
    }

    rebuildPlayersArray();

    if (currentGame.players.length < 2 && currentGame.countdownInterval) {
      stopAndResetCountdown();
    }

    if (currentGame.players.length === 0) {
      resetGame();
    } else {
      broadcastPlayerInfo();
      broadcastWinAmount();
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