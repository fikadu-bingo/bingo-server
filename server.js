const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
const cors = require("cors");

// Routes
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");
const userRoutes = require("./routes/user");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 👉 If needed, replace * with your frontend URL for security
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Use API routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);

// Test endpoint
app.get("/", (req, res) => {
  res.send("✅ Bingo server is running!");
});

// --------------------
// Socket.io logic
// --------------------
const activeGames = {}; // { gameId: { players: [], numbersCalled: [], state: "waiting"/"started"/"ended" } }

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Join game
  socket.on("joinGame", ({ gameId, userId }) => {
    if (!activeGames[gameId]) {
      activeGames[gameId] = { players: [], numbersCalled: [], state: "waiting" };
    }

    activeGames[gameId].players.push({ socketId: socket.id, userId });
    socket.join(gameId);
    console.log(`✅ User ${userId} (${socket.id}) joined game ${gameId}`);

    // Notify players in the room
    io.to(gameId).emit("playerListUpdated", activeGames[gameId].players);

    // Example logic: auto-start when 2 or more players
    if (activeGames[gameId].players.length >= 2 && activeGames[gameId].state === "waiting") {
      activeGames[gameId].state = "started";
      io.to(gameId).emit("gameStarted");
    }
  });

  // Call number
  socket.on("callNumber", ({ gameId, number }) => {
    if (!activeGames[gameId]) return;
    if (!activeGames[gameId].numbersCalled.includes(number)) {
      activeGames[gameId].numbersCalled.push(number);
      io.to(gameId).emit("numberCalled", number);
    }
  });

  // Bingo win
  socket.on("bingoWin", ({ gameId, userId }) => {
    if (!activeGames[gameId]) return;

    activeGames[gameId].state = "ended";
    io.to(gameId).emit("gameWon", { userId });

    // Remove/reset game after 15 sec
    setTimeout(() => {
      delete activeGames[gameId];
      console.log(`♻️ Game ${gameId} has been reset.`);
    }, 15000);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const gameId in activeGames) {
      const game = activeGames[gameId];
      game.players = game.players.filter((p) => p.socketId !== socket.id);

      if (game.players.length === 0 && game.state !== "ended") {
        delete activeGames[gameId];
        console.log(`🗑️ Game ${gameId} deleted (empty).`);
      } else {
        io.to(gameId).emit("playerListUpdated", game.players);
      }
    }
  });
});

// --------------------
// Sync database and start server
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