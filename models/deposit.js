const { DataTypes } = require("sequelize");
const sequelize = require("../config/db"); // adjust this path to your actual sequelize instance

const Deposit = sequelize.define("Deposit", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  receipt_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "pending",
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
    
    tableName: "deposit", // 👈 force lowercase + singular
    freezeTableName: true, // 👈 prevent pluralization
  
});

module.exports = Deposit;
