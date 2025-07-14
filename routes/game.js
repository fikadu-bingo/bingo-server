const express = require("express");
const {
  createGame,
  buyTicket,
  joinGame, // add joinGame controller function
} = require("../controllers/gameController");

const router = express.Router();

// Create new game
router.post("/create", createGame);

// Buy ticket for a game
router.post("/ticket", buyTicket);

// Join a game (this is used by Telegram bot)
router.post("/join", joinGame);

module.exports = router;