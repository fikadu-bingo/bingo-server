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
});

module.exports = Agent;