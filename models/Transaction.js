// models/Transaction.js
module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define("Transaction", {
    type: {
      type: DataTypes.ENUM("deposit", "cashout", "transfer", "win"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "completed"),
      allowNull: false,
      defaultValue: "completed",
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  Transaction.associate = (models) => {
    Transaction.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return Transaction;
};