const Groq = require('groq-sdk'); // 1. Import Groq SDK
const Session = require('../models/Session');
const User = require('../models/User');

// 2. Initialize Groq Client (Ensure GROQ_API_KEY is in .env)
// You might initialize this once outside the functions if preferred
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const ANALYSIS_INTERVAL_SECONDS = 120; // How often frontend sends data (used for calculating time deltas)
const MIN_SECONDS_BETWEEN_CALLS = 120; 
const MIN_MS_BETWEEN_CALLS = MIN_SECONDS_BETWEEN_CALLS * 1000;
// @desc    Start a new session
// @route   POST /api/sessions/start
// @access  Private
exports.startSession = async (req, res) => {
    try {
        const userId = req.user.id; // From authMiddleware

        // Check if user already has an active session (optional, prevents duplicates)
        const existingActiveSession = await Session.findOne({ userId, endTime: null });
        if (existingActiveSession) {
            return res.status(400).json({ message: 'Active session already exists', sessionId: existingActiveSession._id });
        }

        const newSession = new Session({
            userId,
            startTime: new Date(),
            // Initialize other fields if needed
        });

        await newSession.save();

        res.status(201).json({ message: 'Session started', sessionId: newSession._id });
    } catch (error) {
        console.error("Error starting session:", error);
        res.status(500).json({ message: 'Server error starting session' });
    }
};


// @desc    Receive ONE combined data URI (from frontend canvas), analyze with Groq
// @route   POST /api/sessions/data/:sessionId
// @access  Private
exports.processSessionData = async (req, res) => {
    const { sessionId } = req.params;
    const { combinedImageUri } = req.body; // Expecting the full data URI from frontend
    const userId = req.user.id; // Assumes `protect` middleware populates req.user

    // 1. Basic Input Validation
    if (!combinedImageUri) {
        return res.status(400).json({ message: 'Missing combined image data URI' });
    }
    if (!sessionId) {
        return res.status(400).json({ message: 'Missing session ID' });
    }

    try {
        // 2. Find the Active Session
        // Need to fetch the session first to check the rate-limiting timestamp
        const session = await Session.findOne({ _id: sessionId, userId: userId, endTime: null });
        if (!session) {
            console.log(`Process Data: Session ${sessionId} not found or not active for user ${userId}`);
            // Frontend might be sending data after session stopped, return 404
            return res.status(404).json({ message: 'Active session not found or does not belong to user' });
        }

        // 3. Implement Backend Rate Limiting for Groq API Calls
        const now = new Date(); // Current time
        const lastCallTime = session.lastApiCallTimestamp; // Get the timestamp from the DB

        // Check if a timestamp exists and if enough time has passed
        if (lastCallTime && (now.getTime() - lastCallTime.getTime() < MIN_MS_BETWEEN_CALLS)) {
            const secondsSinceLastCall = Math.round((now.getTime() - lastCallTime.getTime()) / 1000);
            const secondsRemaining = MIN_SECONDS_BETWEEN_CALLS - secondsSinceLastCall;

            console.log(`Rate Limit HIT for session ${sessionId}: Only ${secondsSinceLastCall}s passed since last API call (required ${MIN_SECONDS_BETWEEN_CALLS / 1000}s). Wait ${secondsRemaining}s.`);

            // Return a 429 status code to indicate rate limiting
            return res.status(429).json({
                message: `Too many requests. Please wait ${secondsRemaining} more seconds for next analysis.`,
                tryAgainAfter: new Date(now.getTime() + secondsRemaining * 1000) // Optional: Indicate when it's okay to try again
            });
        }

        // 4. Prepare for Groq Call (Rate limit passed OR first call)
        // Ensure prompt clearly describes the expected input and output
        const prompt = `
          You are analyzing a composite image showing a user’s webcam view (LEFT) and their computer screen (RIGHT). You are an expert in productivity monitoring and visual context recognition.

The RIGHT HALF shows a real-time screen capture. 
- Do NOT infer based on tabs or titles. 
- Use the visible main content only: app UI, text layout, buttons, and overall structure.

The LEFT HALF shows the user’s webcam.
- Use facial orientation, gaze, posture to judge focus.

Important context: Some tools like ChatGPT or code assistants may have minimalist UIs but can still indicate deep focus, especially when the content includes technical language, coding examples, or structured writing.

Return a strict JSON object with:

1. "focus" (boolean): TRUE only if webcam gaze is toward screen AND the screen shows a work-related app/tool.
2. "appName" (string): Best guess of the tool or platform in use, based ONLY on visible screen content. Use names like "ChatGPT", "online IDE", "Notion", "Docs", "YouTube", etc. If unclear, return "Unknown".
3. "activity" (string): High-level guess of the user’s activity. Examples: "coding", "writing", "research", "watching video", "social media", "idle", "away", "distracted".

Example output:
{"focus": true, "appName": "ChatGPT", "activity": "coding"}

Only return the JSON object. Do not explain your reasoning.

`;

        console.log(`Backend Rate Limit PASSED for session ${sessionId}. Sending request to Groq...`);
        // Log only a snippet to avoid excessively large logs
        // console.log("Combined URI Snippet:", combinedImageUri.substring(0, 80) + "...");

        // 5. Call Groq API
        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: combinedImageUri } },
                ],
            }],
            model: "meta-llama/llama-4-scout-17b-16e-instruct", // Ensure this is the correct, working vision model
            response_format: { type: "json_object" }, // Enforce JSON output
            temperature: 0.2, // Low temp for consistent JSON
            max_completion_tokens: 150,
            top_p: 1,
            stream: false,
        });

        console.log(`Received Groq response for session ${sessionId}.`);
        const responseContent = chatCompletion.choices[0]?.message?.content;

        // 6. Parse and Validate Groq Response
        if (!responseContent) {
            // Log the completion object for debugging if response is empty
             console.error(`Groq returned empty response content for session ${sessionId}. Completion object:`, chatCompletion);
            throw new Error("Groq returned empty response content.");
        }
        console.log("Groq Raw JSON:", responseContent);

        let analysisResult;
        try {
            analysisResult = JSON.parse(responseContent);
        } catch (parseError) {
            console.error(`Failed to parse Groq JSON for session ${sessionId}:`, responseContent, parseError);
            // Don't update timestamp if parsing fails
            return res.status(500).json({ message: 'Failed to parse analysis result from AI' });
        }

        // Validate structure (adjust keys based on your exact prompt/expected output)
        if (!analysisResult || typeof analysisResult.focus === 'undefined' || !analysisResult.appName || !analysisResult.activity) {
            console.error(`Invalid JSON structure received from AI for session ${sessionId}:`, analysisResult);
            // Don't update timestamp if structure is wrong
            return res.status(500).json({ message: 'Invalid analysis data structure received from AI' });
        }

        // 7. Update Database
        const { focus, appName, activity } = analysisResult;
        // The time increment represents the duration this analysis covers
        const timeIncrement = MIN_SECONDS_BETWEEN_CALLS; // Use the rate limit interval as the duration

        // Fetch User (re-fetching might be needed if it wasn't passed via req.user fully)
        const user = await User.findById(userId);
        if (!user) {
            console.error(`User ${userId} not found during DB update for session ${sessionId}`);
            return res.status(404).json({ message: 'User associated with session not found for update' });
        }

        // Update Session fields atomically
        session.lastApiCallTimestamp = now; // *** Update the timestamp NOW ***
        if (focus) session.focusTime += timeIncrement;
        else session.distractionTime += timeIncrement;
        const currentSessionAppTime = session.appUsage.get(appName) || 0;
        session.appUsage.set(appName, currentSessionAppTime + timeIncrement);
        session.markModified('appUsage'); // Essential for Map types

        // Update User aggregate fields
        if (focus) user.totalFocusTime += timeIncrement;
        else user.totalDistractionTime += timeIncrement;
        const currentUserAppTime = user.appUsage.get(appName) || 0;
        user.appUsage.set(appName, currentUserAppTime + timeIncrement);
        user.markModified('appUsage'); // Essential for Map types

        // Save both documents concurrently
        await Promise.all([
            session.save(),
            user.save()
        ]).catch(dbError => {
             console.error(`Database save error for session ${sessionId}:`, dbError);
             // If DB save fails, maybe we shouldn't count this API call? Or just report server error?
             // For now, just throw a server error. Consider more robust retry/rollback if needed.
             throw new Error("Database update failed after analysis.");
         });

        console.log(`Successfully processed data and updated DB for session ${sessionId}`);

        // 8. Send Success Response to Frontend
        res.status(200).json({
            message: `Analysis complete. Next analysis possible after ${MIN_SECONDS_BETWEEN_CALLS}s.`,
            analysis: analysisResult,
        });

    } catch (error) {
        // Generic error handling for unexpected issues
        console.error(`Unhandled error processing session ${sessionId}:`, error);
        // Check for specific Groq API errors (like invalid key, server issues)
        if (error.response) {
            console.error("Groq API Error Response Data:", error.response.data);
            res.status(error.status || 500).json({ message: 'Error communicating with AI service', details: error.response.data?.error?.message || 'Unknown AI error' });
        } else if (error.request) {
             console.error("Groq API No Response:", error.request);
            res.status(502).json({ message: 'No response received from AI service (Bad Gateway/Timeout)' });
        } else {
             // Handle other errors (DB errors re-thrown, parsing errors already handled, etc.)
            res.status(500).json({ message: error.message || 'Server error processing session data' });
         }
    }
};
// @desc    Stop an active session
// @route   POST /api/sessions/:id/stop
// @access  Private
exports.stopSession = async (req, res) => {
    const { id: sessionId } = req.params; // Changed param name for clarity
    const userId = req.user.id;

    try {
        const session = await Session.findOneAndUpdate(
            { _id: sessionId, userId, endTime: null }, // Find active session for this user
            { $set: { endTime: new Date() } }, // Set the end time
            { new: true } // Return the updated document
        );

        if (!session) {
            return res.status(404).json({ message: 'Active session not found or already stopped' });
        }

        // Optional: Perform final calculations or summarization here if needed

        res.status(200).json({ message: 'Session stopped successfully', session });
    } catch (error) {
        console.error("Error stopping session:", error);
        res.status(500).json({ message: 'Server error stopping session' });
    }
};


// --- Add other necessary controllers ---

// @desc    Get current active session for logged-in user
// @route   GET /api/sessions/current
// @access  Private
exports.getCurrentSession = async (req, res) => {
     try {
        const session = await Session.findOne({ userId: req.user.id, endTime: null });
         if (!session) {
             return res.status(404).json({ message: 'No active session found' });
         }
        res.status(200).json(session);
     } catch (error) {
         console.error("Error fetching current session:", error);
         res.status(500).json({ message: 'Server error' });
     }
 };

// @desc    Get all sessions for logged-in user (for dashboard history)
// @route   GET /api/sessions/history
// @access  Private
exports.getSessionHistory = async (req, res) => {
    try {
        const sessions = await Session.find({ userId: req.user.id })
                                       .sort({ startTime: -1 }); // Sort newest first
        res.status(200).json(sessions);
    } catch (error) {
        console.error("Error fetching session history:", error);
        res.status(500).json({ message: 'Server error' });
    }
};


// @desc    Get overall user stats (can also be part of getUserProfile)
// @route   GET /api/sessions/stats
// @access  Private
// Note: You might already have this in userController/getUserProfile.
// If so, you don't need a separate route here. Just showing data access.
exports.getUserStats = async (req, res) => {
     try {
         // We get the user object from the authMiddleware
         const user = await User.findById(req.user.id).select('totalFocusTime totalDistractionTime appUsage');
         if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
         // Convert Map to a plain object for JSON response if needed by frontend library
         const appUsageObject = Object.fromEntries(user.appUsage);

        res.status(200).json({
            totalFocusTime: user.totalFocusTime,
            totalDistractionTime: user.totalDistractionTime,
            appUsage: appUsageObject,
        });
    } catch (error) {
        console.error("Error fetching user stats:", error);
        res.status(500).json({ message: 'Server error' });
    }
};


// (Ensure sessionRoutes.js uses these controller functions)