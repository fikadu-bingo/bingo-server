const { Game, Ticket, CalledNumber } = require("../models");

// Store intervals to stop games when a winner is found
const activeGames = {};

/**
 * Helper function to check if a ticket has won
 * This version checks for a full card win
 * If you want row, column, or diagonal logic — tell me!
 */
function checkTicketWin(ticketNumbers, calledNumbers) {
  return ticketNumbers.every((num) => calledNumbers.includes(num));
}

function gameSocket(io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinGame", (gameId) => {
      socket.join(gameId);
      console.log(`User ${socket.id} joined game room: ${gameId}`);
    });

    socket.on("startCalling", async (gameId) => {
      if (activeGames[gameId]) {
        console.log(`Game ${gameId} is already running`);
        return;
      }

      const allNumbers = Array.from({ length: 100 }, (_, i) => i + 1);
      const called = [];

      activeGames[gameId] = setInterval(async () => {
        if (called.length >= 100) {
          clearInterval(activeGames[gameId]);
          delete activeGames[gameId];
          console.log(`Game ${gameId} finished without winner`);
          return;
        }

        let newNum;
        do {
          newNum = allNumbers[Math.floor(Math.random() * allNumbers.length)];
        } while (called.includes(newNum));

        called.push(newNum);

        // Save to DB
        await CalledNumber.create({
          gameId,
          number: newNum,
          calledAt: new Date(),
        });

        // Emit number to all players
        io.to(gameId).emit("numberCalled", newNum);

        // Fetch all tickets for this game
        const tickets = await Ticket.findAll({ where: { gameId } });

        for (const ticket of tickets) {
          // Parse numbers (assuming stored as JSON string)
          const ticketNumbers = JSON.parse(ticket.numbers);

          // Check win
          if (checkTicketWin(ticketNumbers, called)) {
            // Emit win to players
            io.to(gameId).emit("gameWon", {
              userId: ticket.userId,
              ticketId: ticket.id,
            });

            // Optionally update ticket
            await ticket.update({ status: "won" });

            // Stop interval and cleanup
            clearInterval(activeGames[gameId]);
            delete activeGames[gameId];

            console.log(`Game ${gameId} won by user ${ticket.userId}`);
            break;
          }
        }
      }, 2000);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
}

module.exports = gameSocket;