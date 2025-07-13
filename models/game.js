const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Game = sequelize.define("Game", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  gameCode: DataTypes.STRING,
  status: {
    type: DataTypes.STRING,
    defaultValue: "waiting", // waiting, ongoing, finished
  },
  stake: DataTypes.FLOAT,
  winnerId: DataTypes.UUID,
});

module.exports = Game;