// models/Agent.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Your Sequelize instance

const Agent = sequelize.define('Agent', {
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'Agents',  // Explicitly match your table in pgAdmin
  timestamps: true,     // Use createdAt and updatedAt columns
});

module.exports = Agent;