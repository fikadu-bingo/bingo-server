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

// Supported stake groups
const STAKE_GROUPS = [10, 20, 50, 100, 200];

// Initialize game states for each stake group
const games = {};
for (const stake of STAKE_GROUPS) {
  games[stake] = {
    playersMap: new Map(),   // userId -> { username, socketIds: Set }
    players: [],             // array for broadcasting
    tickets: {},             // userId -> 5x5 ticket array
    numbersCalled: [],       // called numbers for this game
    state: "waiting",        // waiting | countdown | started | ended
    countdown: 50,
    currentCountdown: 50,
    countdownInterval: null,
    callerInterval: null,
    stakePerPlayer: stake,
  };
}

function rebuildPlayersArray(stake) {
  const game = games[stake];
  game.players = [];
  for (const [userId, data] of game.playersMap.entries()) {
    game.players.push({
      userId,
      username: data.username,
      socketIds: Array.from(data.socketIds),
    });
  }
}

function broadcastPlayerInfo(stake) {
  const game = games[stake];
  io.to(`bingo_${stake}`).emit("playerListUpdated", { players: game.players });
  io.to(`bingo_${stake}`).emit("playerCountUpdate", game.players.length);
}

function broadcastWinAmount(stake) {
  const game = games[stake];
  const stakeNum = Number(game.stakePerPlayer) || 0;
  const totalStake = stakeNum * game.players.length;
  const winAmount = Math.floor(totalStake * 0.8);
  io.to(`bingo_${stake}`).emit("winAmountUpdate", winAmount);
}

function checkBingo(ticket, numbersCalled) {
  const rows = ticket;
  const cols = [];

  for (let i = 0; i < 5; i++) {
    cols[i] = [];
    for (let j = 0; j < 5; j++) {
      cols[i].push(ticket[j][i]);
    }
  }

  const diagonal1 = [ticket[0][0], ticket[1][1], ticket[2][2], ticket[3][3], ticket[4][4]];
  const diagonal2 = [ticket[0][4], ticket[1][3], ticket[2][2], ticket[3][1], ticket[4][0]];

  const isCompleteLine = (line) =>
    line.every((num, idx) => {
      if (idx === 2 && num === ticket[2][2]) return true; // center free space
      return numbersCalled.includes(num);
    });

  for (let i = 0; i < 5; i++) {
    if (isCompleteLine(rows[i])) return true;
    if (isCompleteLine(cols[i])) return true;
  }
  if (isCompleteLine(diagonal1)) return true;
  if (isCompleteLine(diagonal2)) return true;

  return false;
}

function startCountdownIfNeeded(stake) {
  const game = games[stake];
  if (game.countdownInterval) return;
  if (game.state !== "waiting") return;
  if (game.players.length < 2) return; // Only start if at least 2 players
  game.state = "countdown";
  let counter = typeof game.countdown === "number" ? game.countdown : 50;
  game.currentCountdown = counter;

  io.to(`bingo_${stake}`).emit("countdownUpdate", counter);

  game.countdownInterval = setInterval(() => {
    if (game.players.length < 2) {
      clearInterval(game.countdownInterval);
      game.countdownInterval = null;
      game.state = "waiting";
      game.countdown = 50;
      game.currentCountdown = 50;
      io.to(`bingo_${stake}`).emit("countdownStopped", game.currentCountdown);
      return;
    }
    counter -= 1;
    game.currentCountdown = counter;
    io.to(`bingo_${stake}`).emit("countdownUpdate", counter);

    if (counter < 0) {
      clearInterval(game.countdownInterval);
      game.countdownInterval = null;
      game.state = "started";
      game.currentCountdown = 0;
      io.to(`bingo_${stake}`).emit("countdownUpdate", 0);
      io.to(`bingo_${stake}`).emit("gameStarted");

      startCallingNumbers(stake);
    }
  }, 1000);
}

function stopAndResetCountdown(stake) {
  const game = games[stake];
  if (game.countdownInterval) {
    clearInterval(game.countdownInterval);
    game.countdownInterval = null;
  }
  game.state = "waiting";
  game.countdown = 50;
  game.currentCountdown = 50;
  io.to(`bingo_${stake}`).emit("countdownStopped", game.currentCountdown);
}

async function checkForWinner(stake) {
  const game = games[stake];
  for (const player of game.players) {
    const ticket = game.tickets[player.userId];
    if (!ticket) continue;

    if (checkBingo(ticket, game.numbersCalled)) {
      // Winner found
      game.state = "ended";
      io.to(`bingo_${stake}`).emit("gameWon", {
        userId: player.userId,
        username: player.username,
        
      });

      stopCallingNumbers(stake);

      // Calculate prize & update DB
      const stakeNum = Number(game.stakePerPlayer) || 0;
      const totalStake = stakeNum * game.players.length;
      const prize = Math.floor(totalStake * 0.8);

      const losers = game.players
        .map((p) => p.userId)
        .filter((id) => id !== player.userId);

      try {
        await sequelize.transaction(async (t) => {
          const winner = await User.findOne({ where: { id: player.userId }, transaction: t });
          if (!winner) throw new Error("Winner user not found");

          winner.balance = winner.balance - stakeNum + prize;
          if (winner.balance < 0) throw new Error("Winner balance negative");
          await winner.save({ transaction: t });

          const losersRecords = await User.findAll({ where: { id: losers }, transaction: t });
          for (const loser of losersRecords) {
            loser.balance = loser.balance - stakeNum;
            if (loser.balance < 0) loser.balance = 0;
            await loser.save({ transaction: t });
          }
        });

        // Update balances for all players in this game
        const allPlayerIds = game.players.map((p) => p.userId);
        const allPlayers = await User.findAll({ where: { id: allPlayerIds } });
        const balances = {};
        for (const p of allPlayers) {
          balances[p.id] = p.balance;
        }
        io.to(`bingo_${stake}`).emit("balanceChange", { balances });
      } catch (error) {
        console.error("Error updating balances on bingoWin:", error);
      }

      // Reset game after 15 seconds
      setTimeout(() => {
        resetGame(stake);
      }, 15000);

      break;
    }
  }
}

function startCallingNumbers(stake) {
  const game = games[stake];
  if (game.callerInterval) return;
  if (game.numbersCalled.length >= 100) return;

  game.callerInterval = setInterval(async () => {
    if (game.state !== "started") {
      clearInterval(game.callerInterval);
      game.callerInterval = null;
      return;
    }

    let tries = 0;
    let newNumber = null;
    while (tries < 500) {
      const candidate = Math.floor(Math.random() * 100) + 1;
      if (!game.numbersCalled.includes(candidate)) {
        newNumber = candidate;
        break;
      }
      tries++;
    }
    if (newNumber === null) {
      clearInterval(game.callerInterval);
      game.callerInterval = null;
      game.state = "ended";
      io.to(`bingo_${stake}`).emit("gameEnded", { reason: "noNumbersLeft" });
      setTimeout(() => resetGame(stake), 5000);
      return;
    }

    game.numbersCalled.push(newNumber);
    io.to(`bingo_${stake}`).emit("numberCalled", newNumber);

    await checkForWinner(stake);
  }, 3000);
}

function stopCallingNumbers(stake) {
  const game = games[stake];
  if (game.callerInterval) {
    clearInterval(game.callerInterval);
    game.callerInterval = null;
  }
}

function resetGame(stake) {
  const game = games[stake];
  stopCallingNumbers(stake);
  stopAndResetCountdown(stake);

  game.playersMap.clear();
  game.players = [];
  game.tickets = {};
  game.numbersCalled = [];
  game.state = "waiting";
  game.countdown = 50;
  game.currentCountdown = 50;
  // stakePerPlayer remains the same

  io.to(`bingo_${stake}`).emit("stakePlayerCount", { gameId: `bingo_${stake}`, count: 0 });
  io.to(`bingo_${stake}`).emit("gameReset");
}

io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on("joinGame", ({ userId, username = "Player", stake, ticket } = {}) => {
    if (!userId || !stake || !STAKE_GROUPS.includes(Number(stake))) {
      return socket.emit("error", { message: "joinGame requires valid userId and stake" });
    }

    const game = games[stake];

    // Add or update player
    if (game.playersMap.has(userId)) {
      game.playersMap.get(userId).socketIds.add(socket.id);
    } else {
      game.playersMap.set(userId, { username, socketIds: new Set([socket.id]) });
    }

    // Save ticket
    if (ticket && Array.isArray(ticket) && ticket.length === 5) {
      game.tickets[userId] = ticket;
    }

    rebuildPlayersArray(stake);

    socket.join(`bingo_${stake}`);
    console.log(`✅ User ${userId} (${socket.id}) joined bingo_${stake}`);

    broadcastPlayerInfo(stake);
    broadcastWinAmount(stake);

    if (game.players.length >= 2 && game.state === "waiting") {
      startCountdownIfNeeded(stake);
    } else if (game.state === "countdown") {
      socket.emit("countdownUpdate", game.currentCountdown);
    }

    socket.emit("gameStateUpdate", { state: game.state, countdown: game.currentCountdown });
  });

  socket.on("leaveGame", ({ userId, stake } = {}) => {
    if (!userId || !stake || !STAKE_GROUPS.includes(Number(stake))) return;

    const game = games[stake];

    if (game.playersMap.has(userId)) {
      const userData = game.playersMap.get(userId);
      userData.socketIds.delete(socket.id);
      if (userData.socketIds.size === 0) {
        game.playersMap.delete(userId);
        delete game.tickets[userId];
      }
    }

    rebuildPlayersArray(stake);

    socket.leave(`bingo_${stake}`);

    broadcastPlayerInfo(stake);
    broadcastWinAmount(stake);

    if (game.players.length < 2 && game.countdownInterval) {
      stopAndResetCountdown(stake);
    }

    if (game.players.length === 0) {
      resetGame(stake);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    for (const stake of STAKE_GROUPS) {
      const game = games[stake];
      for (const [userId, data] of game.playersMap.entries()) {
        if (data.socketIds.has(socket.id)) {
          data.socketIds.delete(socket.id);
          if (data.socketIds.size === 0) {
            game.playersMap.delete(userId);
            delete game.tickets[userId];
          }
          break;
        }
      }

      rebuildPlayersArray(stake);

      if (game.players.length < 2 && game.countdownInterval) {
        stopAndResetCountdown(stake);
      }
      if (game.players.length === 0) {
        resetGame(stake);
      } else {
        broadcastPlayerInfo(stake);
        broadcastWinAmount(stake);
      }
    }
  });

  socket.on("bingoWin", () => {
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
