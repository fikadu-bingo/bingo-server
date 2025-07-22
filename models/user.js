const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define("User", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  telegram_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING,
  },
  profile_picture: {
    type: DataTypes.STRING, // Will store the URL or file ID from Telegram
    allowNull: true,
  },
  balance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
});

module.exports = User;