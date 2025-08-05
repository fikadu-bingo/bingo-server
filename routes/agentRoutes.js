const express = require("express");
const router = express.Router();
const uploadMiddleware = require("../middleware/upload");
const verifyAgentToken = require("../middleware/agentAuth"); // ✅ fixed import

const {
  agentLogin,
  getDepositRequests,
  approveDeposit,
  rejectDeposit,
  getCashoutRequests,
  approveCashout,
  rejectCashout
} = require("../controllers/agentController");

// ✅ Agent Login (public)
router.post("/login", agentLogin);

// ✅ All routes below require authentication
router.use(verifyAgentToken);

router.get("/deposit-requests", getDepositRequests);
router.post("/deposit-requests/:id/approve", approveDeposit);
router.post("/deposit-requests/:id/reject", rejectDeposit);

router.get("/cashout-requests", getCashoutRequests);
router.post(
  "/cashout-requests/:id/approve",
  uploadMiddleware.single("receipt"),
  approveCashout
);
router.post("/cashout-requests/:id/reject", rejectCashout);

module.exports = router;