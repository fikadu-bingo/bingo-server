const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Cashout = sequelize.define("cashout", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
  },
  receipt: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "pending",
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "cashouts", // ensure it matches your actual DB table
  timestamps: false,     // set to true if using createdAt/updatedAt
});

module.exports = Cashout;