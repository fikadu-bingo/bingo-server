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

// ✅ Add joinGame logic (new)
exports.joinGame = async (req, res) => {
  try {
    const { userId } = req.body;

    // Find an open game (for simplicity, using the latest)
    const game = await Game.findOne({
      order: [["createdAt", "DESC"]],
    });

    if (!game) {
      return res.status(404).json({ message: "No active game found" });
    }

    // You can create a ticket for the user or just confirm they joined
    // Example: here we only confirm joining
    res.json({ message: `Joined game ${game.gameCode} successfully!`, gameId: game.id });
  } catch (error) {
    console.error("Error joining game:", error);
    res.status(500).json({ message: "Failed to join game" });
  }
};