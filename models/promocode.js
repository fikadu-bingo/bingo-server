// models/promocode.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Adjust to your db setup path

const PromoCode = sequelize.define('promocode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  commission: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
  },
}, {
  tableName: 'promocodes',
  timestamps: true,
  hooks: {
    beforeValidate: (promo) => {
      if (promo.code) {
        promo.code = promo.code.toLowerCase();
      }
    },
  },
});

module.exports = PromoCode;