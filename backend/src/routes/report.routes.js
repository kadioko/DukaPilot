const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
  createReport,
  getMyReports,
  getAllReports,
  updateReport,
} = require("../controllers/report.controller");

const router = express.Router();

// User routes
router.post("/", authenticate, createReport);
router.get("/my", authenticate, getMyReports);

// Admin routes
router.get("/admin", authenticate, requireRole("ADMIN"), getAllReports);
router.patch("/admin/:reportId", authenticate, requireRole("ADMIN"), updateReport);

module.exports = router;