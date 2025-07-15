const Game = require("../models/game");
const Ticket = require("../models/Ticket");

// Create game
exports.createGame = async (req, res) => {
  try {
    const { stake } = req.body;
    const game = await Game.create({
      gameCode: "G" + Math.floor(1000 + Math.random() * 9000),
      stake,
    });
    res.json(game);
  } catch (error) {
    console.error("Error creating game:", error);
    res.status(500).json({ message: "Failed to create game" });
  }
};

// Buy ticket
exports.buyTicket = async (req, res) => {
  try {
    const { userId, gameId, numbers, cartela } = req.body;
    const ticket = await Ticket.create({ userId, gameId, numbers, cartela });
    res.json(ticket);
  } catch (error) {
    console.error("Error buying ticket:", error);
    res.status(500).json({ message: "Failed to buy ticket" });
  }
};

// Join game
exports.joinGame = async (req, res) => {
  try {
    const { telegramId, username } = req.body;

    if (!telegramId) {
      return res.status(400).json({ message: "telegramId is required" });
    }

    // Find an active game (latest created)
    const game = await Game.findOne({
      order: [["createdAt", "DESC"]],
    });

    if (!game) {
      return res.status(404).json({ message: "No active game found" });
    }

    // Example: you might generate a simple ticket number (here just random for now)
    const ticketNumber = "T" + Math.floor(1000 + Math.random() * 9000);

    // You can also store tickets in DB if needed:
    // await Ticket.create({ userId: telegramId, gameId: game.id, numbers: [], cartela: "" });

    res.json({
      message: `Joined game ${game.gameCode} successfully!`,
      gameId: game.id,
      ticketNumber: ticketNumber,
    });
  } catch (error) {
    console.error("Error joining game:", error);
    res.status(500).json({ message: "Failed to join game" });
  }
};