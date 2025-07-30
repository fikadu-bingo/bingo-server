const express = require("express");
const router = express.Router();
const { getDepositRequests } = require("../controllers/agentController");
const {
  agentLogin,
  getDepositRequests,
  approveDeposit,
  rejectDeposit,
  getCashoutRequests,
  approveCashout,
  rejectCashout
} = require("../controllers/agentController");

// ---------------------------
// Routes
// ---------------------------

// Agent Login
router.post("/login", agentLogin);

// Deposit requests
router.get("/deposit-requests", getDepositRequests);
router.post("/deposit-requests/:id/approve", approveDeposit);
router.post("/deposit-requests/:id/reject", rejectDeposit);

// Cashout requests
router.get("/cashout-requests", getCashoutRequests);
router.post("/cashout-requests/:id/approve", approveCashout);
router.post("/cashout-requests/:id/reject", rejectCashout); // Optional: for rejecting

module.exports = router;