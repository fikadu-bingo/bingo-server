const express = require("express");
const {
  createGame,
  buyTicket,
  joinGame, // include joinGame function
} = require("../controllers/gameController");

const router = express.Router();

// ✅ Create a new game
router.post("/create", createGame);

// ✅ Buy ticket for a game
router.post("/ticket", buyTicket);

// ✅ Join a game (for Telegram bot)
router.post("/join", joinGame);

module.exports = router;