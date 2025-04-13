// routes/sessionRoutes.js
const express = require("express");
const router = express.Router();

const {
    startSession,
    processSessionData,
    stopSession,
    getCurrentSession,
    getSessionHistory,
    getUserStats,
    getSessionById,
    getDailyAnalysis,
    getDailyAppUsage, // Assuming getUserStats remains in sessionController for now
} = require("../controllers/sessionController");

const protect = require("../middleware/authMiddleware"); // Import authentication middleware

// Apply authentication middleware to all session routes
// All actions related to sessions require a logged-in user
router.use(protect);

// @route   POST /api/sessions/start
// @desc    Start a new focus session for the logged-in user
// @access  Private
router.post("/start", startSession);

// @route   POST /api/sessions/data/:sessionId
// @desc    Process a data point (webcam + screen image) for a specific session
// @access  Private
router.post("/data/:sessionId", processSessionData);

// @route   POST /api/sessions/:id/stop
// @desc    Stop (end) a specific focus session
// @access  Private
router.post("/:id/stop", stopSession); // Using :id to match stopSession's req.params.id

// @route   GET /api/sessions/current
// @desc    Get the currently active session for the logged-in user (if any)
// @access  Private
router.get("/current", getCurrentSession);

// @route   GET /api/sessions/history
// @desc    Get the history of all completed sessions for the logged-in user
// @access  Private
router.get("/history", getSessionHistory);

// @route   GET /api/sessions/stats
// @desc    Get the aggregated lifetime stats for the logged-in user
// @access  Private
// Note: You might move the *logic* for this into the userController if preferred,
// but the route can live here if it's primarily session/analytics related data.
router.get("/stats", getUserStats);
router.get('/daily/apps', protect, getDailyAppUsage);
router.get('/daily', protect, getDailyAnalysis);
router.get("/:id", getSessionById);

module.exports = router;