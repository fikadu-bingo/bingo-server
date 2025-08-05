// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const adminAuth = require("../middleware/adminAuth");

// Public login route
router.post("/login", adminController.adminLogin);

// Protected routes
router.get("/stats", adminAuth, adminController.getStats);

module.exports = router;