const Game = require("../models/game");
const Ticket = require("../models/Ticket");

exports.createGame = async (req, res) => {
  const { stake } = req.body;
  const game = await Game.create({
    gameCode: "G" + Math.floor(1000 + Math.random() * 9000),
    stake,
  });
  res.json(game);
};

exports.buyTicket = async (req, res) => {
  const { userId, gameId, numbers, cartela } = req.body;
  const ticket = await Ticket.create({ userId, gameId, numbers, cartela });
  res.json(ticket);
};