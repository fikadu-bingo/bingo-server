require("dotenv").config(); // ✅ Load .env locally
const express = require("express");
const testRoutes = require('./routes/test');

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

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.replace(/\/$/, "") 
                       ?? "https://bingo-telegram-web.vercel.app";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/promocode", promocodeRoutes);
app.use("/api/promoter", promoterRoutes);
app.use('/api', testRoutes);

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
    playersMap: new Map(),
    players: [],
    tickets: {},
    numbersCalled: [],
    state: "waiting",
    countdown: 50,
    currentCountdown: 50,
    countdownInterval: null,
    callerInterval: null,
    stakePerPlayer: stake,
    selectedNumbers: {}, // <-- added for live marking
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
  if (game.players.length < 2) return;
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
  if (!game) return;

  for (const player of game.players) {
    const ticket = game.tickets[player.userId];
    if (!ticket) continue;

    if (checkBingo(ticket, game.numbersCalled)) {
      game.state = "ended";

      const stakeNum = Number(game.stakePerPlayer) || 0;
      const totalStake = stakeNum * game.players.length;
      const prize = Math.floor(totalStake * 0.8);

      io.to(`bingo_${stake}`).emit("gameWon", {
        userId: player.userId,
        username: player.username,
        prize
      });

      stopCallingNumbers(stake);

      const losers = game.players
        .map((p) => p.userId)
        .filter((id) => id !== player.userId);

      try {
        await sequelize.transaction(async (t) => {
          const winner = await User.findOne({
            where: { telegram_id: player.userId },
            transaction: t,
          });
          if (!winner) throw new Error("Winner user not found");

          winner.balance = winner.balance - stakeNum + prize;
          if (winner.balance < 0) winner.balance = 0;
          await winner.save({ transaction: t });

          io.to(`user_${winner.telegram_id}`).emit("balanceChange", {
            userId: winner.telegram_id,
            newBalance: winner.balance,
          });

          const losersRecords = await User.findAll({
            where: { telegram_id: losers },
            transaction: t,
          });

          for (const loser of losersRecords) {
            loser.balance = loser.balance - stakeNum;
            if (loser.balance < 0) loser.balance = 0;
            await loser.save({ transaction: t });

            io.to(`user_${loser.telegram_id}`).emit("balanceChange", {
              userId: loser.telegram_id,
              newBalance: loser.balance,
            });
          }
        });
      } catch (error) {
        console.error("Error updating balances on bingoWin:", error);
      }

      setTimeout(() => resetGame(stake), 15000);
      break;
    }
  }
}

function startCallingNumbers(stake) {
  const game = games[stake];
  if (game.callerInterval) return;
  if (game.numbersCalled.length >= 75) return;

  game.callerInterval = setInterval(async () => {
    if (game.state !== "started") {
      clearInterval(game.callerInterval);
      game.callerInterval = null;
      return;
    }

    let tries = 0;
    let newNumber = null;
    while (tries < 500) {
      const candidate = Math.floor(Math.random() * 75) + 1;
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

    //await checkForWinner(stake);
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
  game.selectedNumbers = {};

  io.to(`bingo_${stake}`).emit("stakePlayerCount", { gameId: `bingo_${stake}`, count: 0 });
  io.to(`bingo_${stake}`).emit("gameReset");
}

// ✅ Fixed Bingo ticket generator (row-major)
function generateBingoTicket() {
  const ticket = Array.from({ length: 5 }, () => Array(5).fill(0));
  const ranges = [
    [1, 15], [16, 30], [31, 45], [46, 60], [61, 75],
  ];

  for (let col = 0; col < 5; col++) {
    const nums = [];
    while (nums.length < 5) {
      const n = Math.floor(Math.random() * (ranges[col][1] - ranges[col][0] + 1)) + ranges[col][0];
      if (!nums.includes(n)) nums.push(n);
    }
    nums.sort((a, b) => a - b);

    for (let row = 0; row < 5; row++) {
      ticket[row][col] = nums[row];
    }
  }

  ticket[2][2] = "★"; // free space
  return ticket;
}

io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on("joinGame", ({ userId, username = "Player", stake, ticket } = {}) => {
    if (!userId || !stake || !STAKE_GROUPS.includes(Number(stake))) {
      return socket.emit("error", { message: "joinGame requires valid userId and stake" });
    }

    const game = games[stake];

    if (game.playersMap.has(userId)) {
      game.playersMap.get(userId).socketIds.add(socket.id);
    } else {
      game.playersMap.set(userId, { username, socketIds: new Set([socket.id]) });
    }

    if (!ticket || ticket.length !== 5) {
      ticket = generateBingoTicket();
    }
    game.tickets[userId] = ticket;

    io.to(socket.id).emit("ticketAssigned", { ticket });

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

  // ================== Live selection handlers ==================
  socket.on("selectTicketNumber", ({ userId, stake, number }) => {
    const game = games[stake];
    if (!game) return;

    if (!game.selectedNumbers[userId]) game.selectedNumbers[userId] = [];
    if (!game.selectedNumbers[userId].includes(number)) {
      game.selectedNumbers[userId].push(number);
    }

    io.to(`bingo_${stake}`).emit("ticketNumbersUpdated", game.selectedNumbers);
  });

  socket.on("deselectTicketNumber", ({ userId, stake, oldNumber }) => {
    const game = games[stake];
    if (!game || !game.selectedNumbers[userId]) return;

    game.selectedNumbers[userId] = game.selectedNumbers[userId].filter(n => n !== oldNumber);
    io.to(`bingo_${stake}`).emit("ticketNumbersUpdated", game.selectedNumbers);
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
        delete game.selectedNumbers[userId];
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
            delete game.selectedNumbers[userId];
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

socket.on("bingoWin", async ({ userId, stake, ticket }) => {
  try {
    const game = games[stake];
    if (!game) return socket.emit("error", { message: "Game not found" });
    if (!userId || !ticket || !game.tickets[userId]) {
      return socket.emit("error", { message: "Invalid Bingo request" });
    }

    const numbersCalled = game.numbersCalled;
    const isWinner = checkBingo(ticket, numbersCalled);

    if (!isWinner) {
      return socket.emit("bingoFail", { message: "Your Bingo claim is invalid!" });
    }

    game.state = "ended";
    stopCallingNumbers(stake);
    stopAndResetCountdown(stake);

    const stakeNum = Number(game.stakePerPlayer) || 0;
    const totalStake = stakeNum * game.players.length;
    const prize = Math.floor(totalStake * 0.8);

    io.to(bingo_${stake}).emit("gameWon", {
      userId,
      username: game.playersMap.get(userId)?.username,
      prize
    });

    if (typeof updateBalances === "function") {
      await updateBalances(stake, userId, prize);
    }

    setTimeout(() => resetGame(stake), 15000);
  } catch (err) {
    console.error("Error in bingoWin:", err);
    socket.emit("error", { message: "Server error processing Bingo" });
  }
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