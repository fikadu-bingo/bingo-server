const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Game = require("./Game");

const CalledNumber = sequelize.define("CalledNumber", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  number: DataTypes.INTEGER,
  calledAt: DataTypes.DATE,
});

CalledNumber.belongsTo(Game, { foreignKey: "gameId" });

module.exports = CalledNumber;