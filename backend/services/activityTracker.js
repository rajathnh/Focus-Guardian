// backend/services/activityTracker.js

// Use dynamic import for the ESM-only active-win package
const activeWinPromise = import('active-win');

const Session = require('../models/Session.js'); // Use require
const User = require('../models/User.js');       // Use require
const mongoose = require('mongoose');             // Use require

// --- Configuration ---
const TRACKING_INTERVAL_SECONDS = 5; // How often to check active window
const UPDATE_INTERVAL_MS = TRACKING_INTERVAL_SECONDS * 1000;

// --- State Management ---
const activeTrackers = new Map(); // Map<sessionId, NodeJS.Timeout>

// --- Helper Functions ---

function sanitizeAppName(appName) {
    if (!appName || typeof appName !== 'string') {
        return "Unknown";
    }
    // Replace characters invalid in MongoDB keys (dots, leading '$')
    return appName.replace(/\./g, '_').replace(/^\$/, '_$');
}

// Make the function async to handle the dynamic import
async function checkAndUpdateActivity(sessionId, userId) {
    // console.log(`[Tracker] Checking activity for session: ${sessionId}`); // Keep commented unless debugging interval

    // Resolve the dynamic import
    const activeWin = (await activeWinPromise).default; // Access the default export

    try {
        const windowInfo = await activeWin(); // Now call the imported function

        // Estimate App and Activity
        let currentAppName = "Unknown";
        let currentWindowTitle = "";
        let estimatedActivity = "Idle/Unknown";

        if (windowInfo) {
            currentAppName = windowInfo.owner?.name || "Unknown";
            currentWindowTitle = windowInfo.title || "";
            // Basic Activity Estimation (can be improved)
            const appLower = currentAppName.toLowerCase();
            if (appLower.includes("code")) estimatedActivity = "Coding";
            else if (appLower.includes("word") || appLower.includes("docs")) estimatedActivity = "Writing";
            else if (appLower.includes("photoshop") || appLower.includes("illustrator") || appLower.includes("figma")) estimatedActivity = "Designing";
            else if (appLower.includes("excel") || appLower.includes("sheets")) estimatedActivity = "Spreadsheet Work";
            else if (appLower.includes("chrome") || appLower.includes("firefox") || appLower.includes("edge") || appLower.includes("safari") || appLower.includes("browser")) estimatedActivity = "Browsing";
            else if (appLower.includes("slack") || appLower.includes("teams") || appLower.includes("discord")) estimatedActivity = "Communicating";
            else if (currentAppName !== "Unknown") estimatedActivity = `Using ${currentAppName}`;
            else estimatedActivity = "Active"; // Default if unknown but window exists
        } else {
            currentAppName = "Idle/Unknown";
            estimatedActivity = "Idle";
        }

        const sanitizedAppName = sanitizeAppName(currentAppName);

        // --- Database Update ---
        // Find the session and user *each time* to ensure we have fresh data
        // Only select fields needed for update to optimize potentially
        const session = await Session.findOne(
             { _id: sessionId, userId: userId, endTime: null }
             // Optionally select fields: .select('appUsage focusTime distractionTime lastDetectedApp lastDetectedActivity')
        );
        // Find user only if needed for aggregate updates or focus categorization
        const user = await User.findById(userId); // .select('appUsage totalFocusTime totalDistractionTime');

        // Check if session is still active and user exists
        if (!session) {
            // console.log(`[Tracker] Session ${sessionId} stopped or not found during check. Stopping tracker.`); // Reduce noise
            stopTracking(sessionId); // Clean up the interval if session ended externally
            return;
        }
        if (!user) {
            console.error(`[Tracker] User ${userId} not found for active session ${sessionId}. Stopping tracker.`);
            stopTracking(sessionId);
            return;
        }

        // --- UPDATE LATEST ACTIVITY FIELDS ---
        session.lastDetectedApp = currentAppName;
        session.lastDetectedActivity = estimatedActivity;
        // -----------------------------------

        // --- UPDATE APP USAGE MAP ---
        const timeIncrement = TRACKING_INTERVAL_SECONDS; // Time elapsed since last check
        const currentSessionAppTime = session.appUsage.get(sanitizedAppName) || 0;
        session.appUsage.set(sanitizedAppName, currentSessionAppTime + timeIncrement);
        session.markModified('appUsage'); // !!! IMPORTANT for Map updates !!!

        const currentUserAppTime = user.appUsage.get(sanitizedAppName) || 0;
        user.appUsage.set(sanitizedAppName, currentUserAppTime + timeIncrement);
        user.markModified('appUsage'); // !!! IMPORTANT for Map updates !!!

        // ---- FOCUS / DISTRACTION (Simplified based on App Category - Optional) ----
        // This part remains optional - focus is primarily driven by frontend webcam push now
        // If you keep this, ensure it doesn't conflict with the frontend push updates
        // const workApps = ['code.exe', 'winword.exe', 'excel.exe', /* Add more */]; // Customize list
        // const isWorkApp = workApps.includes(currentAppName.toLowerCase());
        // // Example: Only update if NOT explicitly handled by frontend push? Or just remove this block.
        // if (isWorkApp) {
        //      // session.focusTime = (session.focusTime || 0) + timeIncrement; // Careful not to double-count
        //      // user.totalFocusTime = (user.totalFocusTime || 0) + timeIncrement;
        // } else {
        //     // session.distractionTime = (session.distractionTime || 0) + timeIncrement;
        //     // user.totalDistractionTime = (user.totalDistractionTime || 0) + timeIncrement;
        // }
        // -----------------------------------------------------------------------


        // Save updated documents
        // Using individual saves might be slightly safer for atomicity if needed
        await session.save();
        await user.save();

        // console.log(`[Tracker] Logged App: '${currentAppName}', Activity: '${estimatedActivity}' in session ${sessionId}`); // Reduce noise

    } catch (error) {
        // Handle specific errors if needed (e.g., activeWin errors, DB errors)
        console.error(`[Tracker] Error during activity check for session ${sessionId}:`, error);
        // Optional: Implement retry logic or stop tracker on certain errors
    }
}

// --- Exported Functions (Using exports. syntax for CommonJS) ---

function startTracking(sessionId, userId) {
    if (activeTrackers.has(sessionId)) {
        console.log(`[Tracker] Tracking already active for session: ${sessionId}`);
        return; // Already tracking this session
    }
    console.log(`[Tracker] Starting activity tracking for session: ${sessionId}, User: ${userId}`);
    // Run immediately once, then set interval
    // Wrap the async function call to handle potential errors
    checkAndUpdateActivity(sessionId, userId).catch(err => console.error(`[Tracker] Initial check failed for ${sessionId}:`, err));
    const intervalId = setInterval(() => {
        // Wrap the async function call inside interval too
        checkAndUpdateActivity(sessionId, userId).catch(err => console.error(`[Tracker] Interval check failed for ${sessionId}:`, err));
    }, UPDATE_INTERVAL_MS);
    activeTrackers.set(sessionId, intervalId);
}
exports.startTracking = startTracking; // Assign to exports

function stopTracking(sessionId) {
    if (activeTrackers.has(sessionId)) {
        const intervalId = activeTrackers.get(sessionId);
        clearInterval(intervalId);
        activeTrackers.delete(sessionId);
        console.log(`[Tracker] Stopped activity tracking for session: ${sessionId}`);
    } else {
        // console.log(`[Tracker] No active tracking found to stop for session: ${sessionId}`); // Reduce noise
    }
}
exports.stopTracking = stopTracking; // Assign to exports

function stopAllTrackers() {
    console.log('[Tracker] Stopping all active trackers...');
    activeTrackers.forEach((intervalId, sessionId) => {
        clearInterval(intervalId);
        console.log(`[Tracker] Stopped tracking for session: ${sessionId}`);
    });
    activeTrackers.clear();
}
exports.stopAllTrackers = stopAllTrackers; // Assign to exports

// Note: Consider adding graceful shutdown in app.js to call stopAllTrackers()
// process.on('SIGINT', () => { activityTracker.stopAllTrackers(); process.exit(); });
// process.on('SIGTERM', () => { activityTracker.stopAllTrackers(); process.exit(); });