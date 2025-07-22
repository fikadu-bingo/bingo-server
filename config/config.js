require("dotenv").config();

module.exports = {
  development: {
    username: "postgres",
    password: "Qulfii@123",
    database: "bingo_db",
    host: "127.0.0.1",
    dialect: "postgres",
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  },
};