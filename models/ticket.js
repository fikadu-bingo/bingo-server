const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./user");
const Game = require("./game");

const Ticket = sequelize.define("Ticket", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  numbers: DataTypes.JSONB,
  cartela: DataTypes.STRING,
});

Ticket.belongsTo(User, { foreignKey: "userId" });
Ticket.belongsTo(Game, { foreignKey: "gameId" });

module.exports = Ticket;