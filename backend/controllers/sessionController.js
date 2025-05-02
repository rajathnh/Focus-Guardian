// backend/controllers/sessionController.js

// --- Required Modules ---
const Session = require('../models/Session.js');
const User = require('../models/User.js');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
// Require the activity tracker service
const activityTracker = require('../services/activityTracker.js');

// --- START SESSION ---
exports.startSession = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const existingActiveSession = await Session.findOne({ userId, endTime: null });
    if (existingActiveSession) {
        activityTracker.stopTracking(existingActiveSession._id.toString());
        return res.status(400).json({ message: 'Active session already exists', sessionId: existingActiveSession._id });
    }

    const newSession = new Session({
        userId,
        startTime: new Date(),
        focusTime: 0,
        distractionTime: 0,
        appUsage: new Map(),
        lastDetectedApp: null,          // Initialize new fields
        lastDetectedActivity: 'Initializing...' // Initialize new fields
    });
    await newSession.save();

    // Start backend activity tracking
    activityTracker.startTracking(newSession._id.toString(), userId.toString());

    // Return start time along with ID
    res.status(201).json({ message: 'Session started successfully and backend tracking initiated', sessionId: newSession._id, startTime: newSession.startTime });
});

// --- PROCESS SESSION DATA (Stubbed/Placeholder) ---
exports.processSessionData = async (req, res) => {
    const { sessionId } = req.params;
    console.log(`[SessionData Endpoint] Received request for session ${sessionId}. Purpose revised/stubbed.`);
    res.status(410).json({
        message: 'Endpoint functionality changed. App usage tracked by backend. Endpoint awaits potential repurposing (e.g., webcam analysis).',
    });
};

// --- UPDATE FOCUS STATUS (Called by Frontend FocusDetector) ---
exports.updateFocusStatus = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { isFocused, reason, duration } = req.body; // Get status and duration from frontend
    const userId = req.user.id;

    if (typeof isFocused !== 'boolean' || typeof duration !== 'number' || duration < 0) {
        console.warn(`Invalid focus update data received for session ${sessionId}:`, req.body);
        return res.status(400).json({ message: 'Invalid focus status or duration provided' });
    }
    const timeIncrement = Math.min(duration, 60); // Cap duration

    const session = await Session.findOne({ _id: sessionId, userId: userId, endTime: null });
    if (!session) {
        console.log(`Received focus update for stopped/unknown session: ${sessionId}`);
        return res.status(404).json({ message: 'Active session not found for this update' });
    }
    const user = await User.findById(userId);
    if (!user) {
         console.error(`User ${userId} not found for active session ${sessionId} during focus update.`);
         return res.status(404).json({ message: 'User not found for this session' });
    }

    // Update Database based on webcam focus status
    if (isFocused) {
        session.focusTime = (session.focusTime || 0) + timeIncrement;
        user.totalFocusTime = (user.totalFocusTime || 0) + timeIncrement;
    } else {
        session.distractionTime = (session.distractionTime || 0) + timeIncrement;
        user.totalDistractionTime = (user.totalDistractionTime || 0) + timeIncrement;
    }

    try {
        await Promise.all([session.save(), user.save()]);
        res.status(200).json({ message: 'Focus status updated' });
    } catch (dbError) {
         console.error(`DB Error updating focus status for session ${sessionId}:`, dbError);
         res.status(500).json({ message: 'Database error updating focus status'});
    }
});

// --- GET LATEST ACTIVITY (Called by Frontend Polling) ---
exports.getLatestActivity = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID format' });
    }
    // console.log(`[getLatestActivity] Request for session ${sessionId}, user ${userId}`); // Optional Log

    try {
        // Find active session, select only needed fields
        const session = await Session.findOne(
            { _id: sessionId, userId: userId, endTime: null },
            'lastDetectedApp lastDetectedActivity' // Select only these fields
        );

        if (!session) {
            // console.log(`[getLatestActivity] Active session ${sessionId} not found.`); // Optional Log
            return res.status(404).json({ message: 'Active session not found' });
        }

        // Return the latest detected data with fallbacks
        res.status(200).json({
            appName: session.lastDetectedApp || 'Tracking...',
            activity: session.lastDetectedActivity || 'Tracking...'
        });

    } catch (error) {
        console.error(`[getLatestActivity] Error fetching latest activity for session ${sessionId}:`, error);
        res.status(500).json({ message: 'Server error fetching latest activity' });
    }
});

// --- STOP SESSION ---
exports.stopSession = asyncHandler(async (req, res) => {
    const { id: sessionId } = req.params;
    const userId = req.user.id;

    activityTracker.stopTracking(sessionId); // Stop backend tracker first

    const session = await Session.findOneAndUpdate(
        { _id: sessionId, userId, endTime: null },
        { $set: { endTime: new Date() } },
        { new: true }
    );

    if (!session) {
        activityTracker.stopTracking(sessionId); // Ensure stopped
        return res.status(404).json({ message: 'Active session not found or already stopped' });
    }
    res.status(200).json({ message: 'Session stopped successfully, backend tracking halted.', session });
});

// --- GET CURRENT ACTIVE SESSION ---
exports.getCurrentSession = asyncHandler(async (req, res) => {
    // console.log(`[getCurrentSession] Request received for user: ${req.user.id}`);
     try {
        // console.log('[getCurrentSession] Finding session...');
        const session = await Session.findOne({ userId: req.user.id, endTime: null });
        // console.log('[getCurrentSession] Session find result:', session ? `ID: ${session._id}`: 'null');

         if (!session) {
             // console.log('[getCurrentSession] No active session found, sending 404.');
             return res.status(404).json({ message: 'No active session found' });
         }
        // console.log('[getCurrentSession] Active session found, sending 200.');
        res.status(200).json(session);
     } catch (error) {
         console.error("[getCurrentSession] Error fetching current session:", error);
         res.status(500).json({ message: 'Server error fetching current session' });
     }
 });

// --- GET SESSION HISTORY ---
exports.getSessionHistory = asyncHandler(async (req, res) => {
    // console.log(`[getSessionHistory] Request received for user ${req.user.id}`);
    try {
        const sessions = await Session.find({ userId: req.user.id }).sort({ startTime: -1 });
        res.status(200).json(sessions);
    } catch (error) {
        console.error("[getSessionHistory] Error fetching session history:", error);
        res.status(500).json({ message: 'Server error fetching session history' });
    }
});

// --- GET SESSION BY ID ---
exports.getSessionById = asyncHandler(async (req, res) => {
    const sessionId = req.params.id;
    const userId = req.user.id;
    // console.log(`[getSessionById] Request received for session ${sessionId}, user ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID format' });
    }
    const session = await Session.findOne({ _id: sessionId, userId: userId });
    if (!session) {
        return res.status(404).json({ message: 'Session not found or access denied' });
    }
    res.status(200).json(session);
});

// --- GET AGGREGATED USER STATS ---
exports.getUserStats = asyncHandler(async (req, res) => {
    // console.log(`[getUserStats] Request received for user ${req.user.id}`);
     try {
         const user = await User.findById(req.user.id).select('totalFocusTime totalDistractionTime appUsage');
         if (!user) { return res.status(404).json({ message: 'User not found' }); }
         const appUsageObject = Object.fromEntries(user.appUsage || new Map());
        res.status(200).json({
            totalFocusTime: user.totalFocusTime || 0,
            totalDistractionTime: user.totalDistractionTime || 0,
            appUsage: appUsageObject,
        });
    } catch (error) {
        console.error("[getUserStats] Error fetching user stats:", error);
        res.status(500).json({ message: 'Server error fetching user stats' });
    }
});

// --- GET DAILY AGGREGATED ANALYSIS (Focus/Distraction) ---
exports.getDailyAnalysis = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const numberOfDays = parseInt(req.query.days, 10) || 7;

    if (numberOfDays <= 0 || numberOfDays > 90) { return res.status(400).json({ message: 'Invalid number of days requested.' }); }
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (numberOfDays - 1));
    // console.log(`[getDailyAnalysis] Fetching daily analysis for user ${userId} from ${startDate.toISOString()} for ${numberOfDays} days.`);

    try {
        const dailyStats = await Session.aggregate([ /* ... aggregation pipeline ... */
            { $match: { userId: userId, startTime: { $gte: startDate } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startTime", timezone: "UTC" } }, totalFocusTime: { $sum: "$focusTime" }, totalDistractionTime: { $sum: "$distractionTime" }, sessionCount: { $sum: 1 } } },
            { $project: { _id: 0, date: "$_id", focusTime: "$totalFocusTime", distractionTime: "$totalDistractionTime", sessionCount: "$sessionCount", focusPercentage: { $cond: { if: { $gt: [{ $add: ["$totalFocusTime", "$totalDistractionTime"] }, 0] }, then: { $round: [ { $multiply: [ { $divide: ["$totalFocusTime", { $add: ["$totalFocusTime", "$totalDistractionTime"] }] }, 100 ] }, 0 ] }, else: 0 } } } },
            { $sort: { date: 1 } }
        ]);
        const fillMissingDates = (start, days, stats) => { /* ... helper function ... */
            const resultsMap = new Map(stats.map(s => [s.date, s])); const filled = []; const currentDate = new Date(start);
            for (let i = 0; i < days; i++) { const dateStr = currentDate.toISOString().split('T')[0]; if (resultsMap.has(dateStr)) { filled.push(resultsMap.get(dateStr)); } else { filled.push({ date: dateStr, focusTime: 0, distractionTime: 0, sessionCount: 0, focusPercentage: 0 }); } currentDate.setDate(currentDate.getDate() + 1); } return filled;
         };
        const filledStats = fillMissingDates(startDate, numberOfDays, dailyStats);
        res.status(200).json(filledStats);
    } catch (error) {
        console.error("[getDailyAnalysis] Error fetching daily analysis:", error);
        res.status(500).json({ message: 'Server error fetching daily analysis' });
    }
});

// --- GET DAILY AGGREGATED APP USAGE ---
exports.getDailyAppUsage = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const numberOfDays = parseInt(req.query.days, 10) || 7;

    if (numberOfDays <= 0 || numberOfDays > 90) { return res.status(400).json({ message: 'Invalid number of days requested.' }); }
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (numberOfDays - 1));
    // console.log(`[getDailyAppUsage] Fetching daily app usage for user ${userId} from ${startDate.toISOString()} (${numberOfDays} days).`);

    try {
        const appUsagePipeline = [ /* ... aggregation pipeline ... */
            { $match: { userId: userId, startTime: { $gte: startDate } } },
            { $project: { _id: 0, appUsageArray: { $objectToArray: "$appUsage" } } },
            { $unwind: "$appUsageArray" },
            { $group: { _id: "$appUsageArray.k", totalTime: { $sum: "$appUsageArray.v" } } },
            { $project: { _id: 0, appName: "$_id", totalTime: 1 } },
            { $sort: { totalTime: -1 } }
        ];
        const dailyAppStats = await Session.aggregate(appUsagePipeline);
        res.status(200).json(dailyAppStats);
    } catch (error) {
        console.error("[getDailyAppUsage] Error fetching daily app usage statistics:", error);
        res.status(500).json({ message: 'Server error fetching daily app usage data' });
    }
});