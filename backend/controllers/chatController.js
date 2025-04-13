// controllers/chatController.js

const asyncHandler = require('express-async-handler');
const Groq = require('groq-sdk');
const Session = require('../models/Session'); // Assuming your Session model is here
const User = require('../models/User');       // Assuming your User model is here
// Import other necessary models/utils if needed

// Initialize Groq Client (Make sure GROQ_API_KEY is in your .env)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// @desc    Handle incoming chat messages
// @route   POST /api/chat
// @access  Private
exports.handleChatMessage = asyncHandler(async (req, res) => {
    const userId = req.user.id; // From protect middleware
    const { message } = req.body; // Get user message from request body

    // Basic check
    if (!message) {
        return res.status(400).json({ error: 'Message content is required' });
    }

    console.log(`Processing chat message from user ${userId}: "${message}"`);

    // Initialize botResponse - will be overwritten by successful intent/query handling
    let botResponse = "Sorry, I'm having trouble understanding that right now."; // Default response if all else fails
    const lowerCaseMessage = message.toLowerCase();

    // --- Intent Detection and Handling ---

    // 1. Intent: Check Current Status
    if (lowerCaseMessage.includes('status') || lowerCaseMessage.includes('how am i doing') || lowerCaseMessage.includes('current focus')) {
        console.log("Intent detected: Get Current Status");
        const currentSession = await Session.findOne({ userId, endTime: null }).sort({ startTime: -1 }); // Get latest active session

        if (currentSession) {
            const focusTime = currentSession.focusTime || 0;
            const distractionTime = currentSession.distractionTime || 0;
            const totalTime = focusTime + distractionTime;
            const focusPercentage = (totalTime > 0)
                ? Math.round((focusTime / totalTime) * 100)
                : 0;

            botResponse = `In your current session (started at ${currentSession.startTime.toLocaleTimeString()}):
- Focus Time: ${formatDuration(focusTime)}
- Distraction Time: ${formatDuration(distractionTime)}
- Overall Focus: ${focusPercentage}%`;
            // Add top app if available:
            if (currentSession.appUsage && currentSession.appUsage.size > 0) {
                // Sort Map entries by value (time spent)
                const sortedApps = [...currentSession.appUsage.entries()].sort((a, b) => b[1] - a[1]);
                const topApp = sortedApps[0];
                 botResponse += `\n- Top App (so far): ${topApp[0]} (${formatDuration(topApp[1])})`;
            } else {
                 botResponse += `\n- No specific app usage tracked yet.`;
            }
        } else {
            botResponse = "You don't seem to have an active session running.";
        }

    // 2. Intent: Summarize Last Session
    } else if (lowerCaseMessage.includes('summarize') || lowerCaseMessage.includes('last session') || lowerCaseMessage.includes('summary')) {
        console.log("Intent detected: Summarize Last Session");
        const lastSession = await Session.findOne({ userId, endTime: { $ne: null } }).sort({ endTime: -1 }); // Get the most recently completed session

        if (lastSession) {
            const durationSeconds = Math.round((lastSession.endTime - lastSession.startTime) / 1000);
            const focusTime = lastSession.focusTime || 0;
            const distractionTime = lastSession.distractionTime || 0;
            const totalTime = focusTime + distractionTime; // Should ideally be close to durationSeconds if tracking is continuous
            const focusPercentage = (totalTime > 0)
                ? Math.round((focusTime / totalTime) * 100)
                : 0;

            let topAppData = 'N/A';
             if (lastSession.appUsage && lastSession.appUsage.size > 0) {
                const sortedApps = [...lastSession.appUsage.entries()].sort((a, b) => b[1] - a[1]);
                const topApp = sortedApps[0];
                topAppData = `${topApp[0]} (${formatDuration(topApp[1])})`;
             }

            // Use Groq LLM to create a nice summary
            const dataSummary = `Duration: ${formatDuration(durationSeconds)}, Focus Time: ${formatDuration(focusTime)}, Distraction Time: ${formatDuration(distractionTime)}, Focus Percentage: ${focusPercentage}%, Top App Used: ${topAppData}.`;
            const prompt = `You are a helpful productivity assistant. Concisely summarize this focus session data for the user in a friendly and encouraging sentence or two: ${dataSummary}`;

            try {
                console.log("Calling Groq API for summary...");
                const chatCompletion = await groq.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: "llama3-8b-8192", // Fast text model on Groq
                    temperature: 0.6,
                    max_tokens: 150,
                    stream: false,
                });
                botResponse = chatCompletion.choices[0]?.message?.content || `Summary: ${dataSummary}`; // Fallback to raw summary
                console.log("Groq summary received.");
            } catch (err) {
                console.error("Groq summary API error:", err);
                botResponse = `I couldn't generate an AI summary, but here's the data: ${dataSummary}`; // Fallback on error
            }
        } else {
            botResponse = "I couldn't find any completed sessions to summarize.";
        }

    // 3. Intent: Get Productivity Tip
    } else if (lowerCaseMessage.includes('tip') || lowerCaseMessage.includes('advice')) {
        console.log("Intent detected: Get Productivity Tip");
        // Consider adding context from user's recent sessions if available for more tailored tips later
        const prompt = "Provide a concise (1-2 sentences) and actionable productivity tip.";
        try {
            console.log("Calling Groq API for tip...");
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama3-8b-8192", // Fast text model
                temperature: 0.7, // Slightly higher for variety
                max_tokens: 100,
                stream: false,
            });
            botResponse = chatCompletion.choices[0]?.message?.content || "Try the Pomodoro Technique: work focused for 25 minutes, then take a 5-minute break."; // Fallback tip
            console.log("Groq tip received.");
        } catch (err) {
            console.error("Groq tip API error:", err);
            botResponse = "Try the Pomodoro Technique: work focused for 25 minutes, then take a 5-minute break."; // Fallback tip on error
        }

    // --- NEW: Handle General Questions ---
    } else {
        console.log("No specific intent detected. Treating as general query.");
        // Optional: Add a system prompt for persona/context if desired
        // const systemPrompt = "You are a helpful assistant.";

        try {
            console.log("Calling Groq API for general question...");
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    // Optional system prompt:
                    // { role: "system", content: systemPrompt },
                    { role: "user", content: message } // Use the original user message
                ],
                model: "llama3-8b-8192", // Or another suitable model
                temperature: 0.7,      // Adjust for general conversation
                max_tokens: 250,       // Allow for slightly longer answers
                stream: false,
            });

            const potentialResponse = chatCompletion.choices[0]?.message?.content;
            if (potentialResponse && potentialResponse.trim().length > 0) {
                 botResponse = potentialResponse;
                 console.log("Groq general response received.");
            } else {
                console.log("Groq returned an empty response for general query.");
                botResponse = "I received your message, but I don't have a specific response for that right now."; // More specific fallback
            }

        } catch (err) {
            console.error("Groq general query API error:", err);
            // Avoid exposing potential API key issues or detailed errors to the user
            botResponse = "Sorry, I encountered an error trying to process that request. Please try again later.";
        }
    }
    // --- End of Intent Handling ---

    // Send the determined response back to the frontend
    console.log(`Sending bot response: "${botResponse.substring(0, 100)}..."`); // Log truncated response
    res.status(200).json({ response: botResponse });
});


// --- Helper Function (Optional but Recommended) ---
// Formats seconds into a more readable string (e.g., 1m 30s)
function formatDuration(totalSeconds) {
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}

// Add the helper function usage in the status and summary sections:
// Replace `focusTime} seconds` with `${formatDuration(focusTime)}`
// Replace `distractionTime} seconds` with `${formatDuration(distractionTime)}`
// Replace `${topApp[1]}s` with `${formatDuration(topApp[1])}`
// Replace `Duration: ${duration}s` with `Duration: ${formatDuration(durationSeconds)}` (make sure variable name matches)
// I have already added these changes in the code above.


// --- Make sure to export other functions if you add them ---
// exports.getChatHistory = asyncHandler(async (req, res) => { ... });