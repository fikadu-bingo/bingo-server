const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
require("./models/cashout");
const cors = require("cors");
const path = require("path");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");
const userRoutes = require("./routes/user");
const agentRoutes = require("./routes/agentRoutes");
const adminRoutes = require('./routes/admin');
const agentAuthRoutes = require('./routes/agent');   // new authentication route


const app = express();
const server = http.createServer(app);

// ✅ Replace this with your actual frontend domain
const FRONTEND_ORIGIN = "https://bingo-telegram-web.vercel.app";

// --------------------
// ✅ Setup CORS
// --------------------
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true, // if using cookies/auth
  })
);
app.use(express.json());

// ✅ Static files (for receipts)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);
app.use("/api/agent", agentRoutes);

app.use("/api/admin", adminRoutes);
app.use('/api/agent', agentAuthRoutes);  // login

// Root test route
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

const activeGames = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinGame", ({ gameId, userId }) => {
    if (!activeGames[gameId]) {
      activeGames[gameId] = { players: [], numbersCalled: [], state: "waiting" };
    }

    activeGames[gameId].players.push({ socketId: socket.id, userId });
    socket.join(gameId);
    console.log(`✅ User ${userId} (${socket.id}) joined game ${gameId}`);

    io.to(gameId).emit("playerListUpdated", activeGames[gameId].players);

    if (activeGames[gameId].players.length >= 2 && activeGames[gameId].state === "waiting") {
      activeGames[gameId].state = "started";
      io.to(gameId).emit("gameStarted");
    }
  });

  socket.on("callNumber", ({ gameId, number }) => {
    if (!activeGames[gameId]) return;
    if (!activeGames[gameId].numbersCalled.includes(number)) {
      activeGames[gameId].numbersCalled.push(number);
      io.to(gameId).emit("numberCalled", number);
    }
  });

  socket.on("bingoWin", ({ gameId, userId }) => {
    if (!activeGames[gameId]) return;

    activeGames[gameId].state = "ended";
    io.to(gameId).emit("gameWon", { userId });

    setTimeout(() => {
      delete activeGames[gameId];
      console.log(`♻️ Game ${gameId} has been reset.`);
    }, 15000);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const gameId in activeGames) {
      const game = activeGames[gameId];
      game.players = game.players.filter((p) => p.socketId !== socket.id);

      if (game.players.length === 0 && game.state !== "ended") {
        delete activeGames[gameId];
        console.log(`🗑 Game ${gameId} deleted (empty).`);
      } else {
        io.to(gameId).emit("playerListUpdated", game.players);
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