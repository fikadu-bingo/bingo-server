const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
const { User } = require("./models");
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

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "https://bingo-telegram-web.vercel.app";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agent", agentAuthRoutes);
app.use("/api/promocode", promocodeRoutes);
app.use("/api/promoter", promoterRoutes);

app.get("/", (req, res) => {
  res.send("✅ Bingo server is running!");
});

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  },
});

const GAME_ROOM = "bingo";

const currentGame = {
  players: [],        // [{ userId, username, socketIds: [] }]
  tickets: {},        // { userId: [[row arrays]] }  --> Each ticket is a 5x5 array of numbers
  numbersCalled: [],  // numbers already called
  state: "waiting",   // waiting | countdown | started | ended
  countdown: 50,
  countdownInterval: null,
  callerInterval: null,
  currentCountdown: 50,
  stakePerPlayer: 0,
};

const playersMap = new Map();

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

function broadcastPlayerInfo() {
  const players = currentGame.players;
  io.to(GAME_ROOM).emit("playerListUpdated", { players });
  io.to(GAME_ROOM).emit("playerCountUpdate", players.length);
}

function broadcastWinAmount() {
  const stake = Number(currentGame.stakePerPlayer) ?? 0;
  const totalStake = stake * currentGame.players.length;
  const winAmount = Math.floor(totalStake * 0.8);
  io.to(GAME_ROOM).emit("winAmountUpdate", winAmount);
}

// Check if a ticket (5x5 array) has bingo (row, col, diagonal) given numbersCalled array
function checkBingo(ticket, numbersCalled) {
  const rows = ticket;
  const cols = [];

  // Prepare columns and diagonals
  for (let i = 0; i < 5; i++) {
    cols[i] = [];
    for (let j = 0; j < 5; j++) {
      cols[i].push(ticket[j][i]);
    }
  }

  const diagonal1 = [ticket[0][0], ticket[1][1], ticket[2][2], ticket[3][3], ticket[4][4]];
  const diagonal2 = [ticket[0][4], ticket[1][3], ticket[2][2], ticket[3][1], ticket[4][0]];

  // Helper to check if all numbers in array are called or center (free space)
  const isCompleteLine = (line) =>
    line.every((num, idx) => {
      if (idx === 2 && num === ticket[2][2]) return true; // center is free space
      return numbersCalled.includes(num);
    });

  // Check rows
  for (let i = 0; i < 5; i++) {
    if (isCompleteLine(rows[i])) return true;
  }

  // Check columns
  for (let i = 0; i < 5; i++) {
    if (isCompleteLine(cols[i])) return true;
  }

  // Check diagonals
  if (isCompleteLine(diagonal1)) return true;
  if (isCompleteLine(diagonal2)) return true;

  return false;
}

function startCountdownIfNeeded() {
  if (currentGame.countdownInterval) return;
  if (currentGame.state !== "waiting") return;
  currentGame.state = "countdown";
  let counter = typeof currentGame.countdown === "number" ? currentGame.countdown : 50;
  currentGame.currentCountdown = counter;

  io.to(GAME_ROOM).emit("countdownUpdate", counter);
  currentGame.countdownInterval = setInterval(() => {
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
    io.to(GAME_ROOM).emit("countdownUpdate", counter);
    if (counter < 0) {
      clearInterval(currentGame.countdownInterval);
      currentGame.countdownInterval = null;
      currentGame.state = "started";
      currentGame.currentCountdown = 0;
      io.to(GAME_ROOM).emit("countdownUpdate", 0);
      io.to(GAME_ROOM).emit("gameStarted");

      startCallingNumbers();
    }
  }, 1000);
}

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

// THIS FUNCTION: After calling a number, check if any ticket has bingo.
// If so, declare winner and stop the game.
async function checkForWinner() {
  for (const player of currentGame.players) {
    const ticket = currentGame.tickets[player.userId]; // Expect 5x5 array

    if (!ticket) continue; // no ticket?

    if (checkBingo(ticket, currentGame.numbersCalled)) {
      // We have a winner!
      currentGame.state = "ended";
      io.to(GAME_ROOM).emit("gameWon", {
        userId: player.userId,
        username: player.username,
      });
      stopCallingNumbers();

      // Calculate prize & update DB
      const stake = Number(currentGame.stakePerPlayer) ?? 0;
      const totalStake = stake * currentGame.players.length;
      const prize = Math.floor(totalStake * 0.8);

      // losers: all except winner
      const losers = currentGame.players
        .map((p) => p.userId)
        .filter((id) => id !== player.userId);

      try {
        await sequelize.transaction(async (t) => {
          const winner = await User.findOne({ where: { id: player.userId }, transaction: t });
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

        // Update balances for all players
        const allPlayerIds = currentGame.players.map((p) => p.userId);
        const allPlayers = await User.findAll({ where: { id: allPlayerIds } });
        const balances = {};
        for (const p of allPlayers) {
          balances[p.id] = p.balance;
        }
        io.to(GAME_ROOM).emit("balanceChange", { balances });
      } catch (error) {
        console.error("Error updating balances on bingoWin:", error);
      }

      // Reset game after 15 seconds
      setTimeout(() => {
        resetGame();
      }, 15000);

      break; // exit loop after first winner found
    }
  }
}

function startCallingNumbers() {
  if (currentGame.callerInterval) return;
  if (currentGame.numbersCalled.length >= 100) return;
  currentGame.callerInterval = setInterval(async () => {
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

    // After calling a new number, check if anyone has bingo
    await checkForWinner();
  }, 3000);
}

function stopCallingNumbers() {
  if (currentGame.callerInterval) {
    clearInterval(currentGame.callerInterval);
    currentGame.callerInterval = null;
  }
}

function resetGame() {
  stopCallingNumbers();
  stopAndResetCountdown();

  playersMap.clear();
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

io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on("joinGame", ({ userId, username = "Player", stake, ticket } = {}) => {
    if (!userId) {
      return socket.emit("error", { message: "joinGame requires userId" });
    }

    if (stake && !currentGame.stakePerPlayer) {
      currentGame.stakePerPlayer = Number(stake);
    }

    // Add/update user in playersMap
    if (playersMap.has(userId)) {
      playersMap.get(userId).socketIds.add(socket.id);
    } else {
      playersMap.set(userId, { username, socketIds: new Set([socket.id]) });
    }

    // Save player's ticket if provided
    if (ticket && Array.isArray(ticket) && ticket.length === 5) {
      currentGame.tickets[userId] = ticket;
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

  socket.on("leaveGame", ({ userId } = {}) => {
    if (!userId) return;

    if (playersMap.has(userId)) {
      const userData = playersMap.get(userId);
      userData.socketIds.delete(socket.id);
      if (userData.socketIds.size === 0) {
        playersMap.delete(userId);
        delete currentGame.tickets[userId];
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

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    for (const [userId, data] of playersMap.entries()) {
      if (data.socketIds.has(socket.id)) {
        data.socketIds.delete(socket.id);
        if (data.socketIds.size === 0) {
          playersMap.delete(userId);
          delete currentGame.tickets[userId];
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

  // Optional: Remove manual "bingoWin" event, or keep for safety
  socket.on("bingoWin", () => {
    // You can either ignore or reject client manual bingo claims here
    socket.emit("error", { message: "Manual bingo call not allowed." });
  });
});

sequelize
  .sync({ alter: true })
  .then(() => {
    const PORT = process.env.PORT ?? 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to sync DB:", err);
  });