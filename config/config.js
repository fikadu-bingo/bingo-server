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
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
    logging: false,
  },
};