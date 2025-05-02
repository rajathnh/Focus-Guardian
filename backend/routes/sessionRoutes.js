// backend/routes/sessionRoutes.js
const express = require("express"); // Use require
const router = express.Router();

// Use require for controller functions
const {
    startSession,
    processSessionData, // Keep the route defined, controller is stubbed
    stopSession,
    getCurrentSession,
    getSessionHistory,
    getUserStats,
    getSessionById,
    getDailyAnalysis,
    getDailyAppUsage,
    updateFocusStatus, // Endpoint for frontend webcam focus updates
    getLatestActivity // <-- Endpoint for frontend to poll screen activity
} = require("../controllers/sessionController.js"); // Use require

const protect = require("../middleware/authMiddleware.js"); // Use require

// Apply authentication middleware to all session routes below this line
router.use(protect);

// --- Define Routes ---

// Start a new session
router.post("/start", startSession);

// (DEPRECATED/REPURPOSED) Process data point (previously image, now placeholder)
router.post("/data/:sessionId", processSessionData);

// Receive focus status update from frontend focus detector
router.post("/focus/:sessionId", updateFocusStatus);

// Get the last detected app/activity for an active session (for polling)
router.get("/:sessionId/latest-activity", getLatestActivity); // <-- NEW ROUTE

// Stop (end) a specific focus session
router.post("/:id/stop", stopSession);

// Get the currently active session for the logged-in user
router.get("/current", getCurrentSession);

// Get the history of all sessions for the logged-in user
router.get("/history", getSessionHistory);

// Get aggregated lifetime stats for the logged-in user
router.get("/stats", getUserStats);

// Get aggregated app usage time over a period
router.get('/daily/apps', getDailyAppUsage);

// Get aggregated focus/distraction stats per day over a period
router.get('/daily', getDailyAnalysis);

// Get details of a specific session by its ID
router.get("/:id", getSessionById);


// Use module.exports for CommonJS
module.exports = router;