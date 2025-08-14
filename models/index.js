const sequelize = require("../config/db");
const User = require("./user");
const Agent = require("./Agent");
const Game = require("./game");
const Ticket = require("./Ticket");
const Deposit = require("./deposit");
const Cashout = require("./cashout");
const CalledNumber = require("./CalledNumber");
const Promocode = require('./promocode');
// Define associations if needed
User.hasMany(Ticket, { foreignKey: "user_id" });
Ticket.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Deposit, { foreignKey: "user_id" });
Deposit.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Cashout, { foreignKey: "user_id" });
Cashout.belongsTo(User, { foreignKey: "user_id" });

// Export all models
module.exports = {
  sequelize,
  User,
   Agent,
  Game,
  Ticket,
  Deposit,
  Cashout,
  CalledNumber,
   Promocode
};