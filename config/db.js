const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      logging: false,
    })
  : new Sequelize("bingo_db", "postgres", "Qulfii@123", {
      host: "localhost",
      dialect: "postgres",
      logging: false,
    });

module.exports = sequelize;