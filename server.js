const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");
const userRoutes = require("./routes/user");
const cors = require("cors");

// Create express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // put frontend URL if needed
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);

// Test endpoint
app.get("/", (req, res) => {
  res.send("Bingo server running!");
});

// Store active games and their data in memory for now
const activeGames = {}; // { gameId: { players: [], numbersCalled: [], state: "waiting"/"started"/"ended" } }

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Join game room
  socket.on("joinGame", ({ gameId, userId }) => {
    if (!activeGames[gameId]) {
      activeGames[gameId] = { players: [], numbersCalled: [], state: "waiting" };
    }

    activeGames[gameId].players.push({ socketId: socket.id, userId });
    socket.join(gameId);
    console.log(`User ${userId} (${socket.id}) joined game ${gameId}`);

    // Notify all players in room
    io.to(gameId).emit("playerListUpdated", activeGames[gameId].players);

    // If enough players, start game logic (for example, auto-start when 2+ players)
    if (activeGames[gameId].players.length >= 2 && activeGames[gameId].state === "waiting") {
      activeGames[gameId].state = "started";
      io.to(gameId).emit("gameStarted");
    }
  });

  // Handle called number
  socket.on("callNumber", ({ gameId, number }) => {
    if (!activeGames[gameId]) return;
    if (!activeGames[gameId].numbersCalled.includes(number)) {
      activeGames[gameId].numbersCalled.push(number);
      io.to(gameId).emit("numberCalled", number);
    }
  });

  // Handle bingo win
  socket.on("bingoWin", ({ gameId, userId }) => {
    if (!activeGames[gameId]) return;

    activeGames[gameId].state = "ended";
    io.to(gameId).emit("gameWon", { userId });

    // Optionally: reset or remove game after some time
    setTimeout(() => {
      delete activeGames[gameId];
      console.log(`Game ${gameId} has been reset.`);
    }, 15000); // 15 sec after win
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Remove player from any active game
    for (const gameId in activeGames) {
      const game = activeGames[gameId];
      game.players = game.players.filter((p) => p.socketId !== socket.id);
      if (game.players.length === 0 && game.state !== "ended") {
        delete activeGames[gameId];
        console.log(`Game ${gameId} deleted (empty).`);
      } else {
        io.to(gameId).emit("playerListUpdated", game.players);
      }
    }
  });
});

// Sync DB and start server
sequelize.sync({ alter: true }).then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});