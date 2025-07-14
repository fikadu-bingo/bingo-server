const { Sequelize } = require("sequelize");

// Use full connection URL
const sequelize = new Sequelize("postgresql://bingo_db_10lt_user:ojEnUBFUNKjESl8Xix8VzoyZQ5Kw0CKH@dpg-d1prgvmr433s73dmvn00-a/bingo_db_10lt", {
  dialect: "postgres",
  protocol: "postgres",
  logging: false,
});

module.exports = sequelize;
