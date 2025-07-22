const { Sequelize } = require("sequelize");

// Replace these with your actual DB credentials
const sequelize = new Sequelize("bingo_db", "postgres", "Qulfii@123", {
  host: "localhost",
  dialect: "postgres",
  logging: false, // disable SQL logs in console, set true if you want to debug
});

module.exports = sequelize;