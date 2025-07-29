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
      logging: (msg) => console.log("📄 Sequelize:", msg), // ✅ enable logging
    })
  : new Sequelize("bingo_db", "postgres", "Qulfii@123", {
      host: "localhost",
      dialect: "postgres",
      logging: (msg) => console.log("📄 Sequelize:", msg), // ✅ enable logging
    });

module.exports = sequelize;
