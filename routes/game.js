const express = require("express");
const { createGame, buyTicket } = require("../controllers/gameController");
const router = express.Router();

router.post("/create", createGame);
router.post("/ticket", buyTicket);

module.exports = router;