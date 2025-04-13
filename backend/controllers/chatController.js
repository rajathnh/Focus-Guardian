// controllers/chatController.js

require("dotenv").config(); // Ensure environment variables are loaded
const express = require('express');
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');

// --- Import Your Mongoose Models ---
// Adjust paths as necessary for your project structure
const User = require('../models/User');
const Session = require('../models/Session');
const ChatHistory = require('../models/ChatHistory');

// --- Initialize Groq Client ---
if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not defined in the environment variables.");
}
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Configuration ---
const MAX_HISTORY_MESSAGES = 10; // How many past messages (User+Assistant turns) to send to LLM
const REFRESH_INTERVAL = 10;     // Send System Prompt + Stats every N *database* messages
const LLM_MODEL = "llama3-8b-8192"; // Or "mixtral-8x7b-32768" or other Groq LLM
const STT_MODEL = "whisper-large-v3-turbo"; // Groq STT model

// --- System Prompt for the LLM ---
const systemMessage = `
You are the Focus Guardian Assistant, a helpful AI companion integrated within the Focus Guardian application. Your purpose is to help users understand their productivity patterns based on data collected *today*.

Key Responsibilities:
1.  **Analyze Today's Data:** You will periodically receive the user's aggregated focus time, distraction time, focus percentage, and top applications used *for the current day*. Use this data as the primary basis for your responses when available.
2.  **Answer User Questions:** Respond to user queries about their focus, distractions, app usage, and productivity trends *for today*, using the provided data and conversation history.
3.  **Provide Insights & Encouragement:** Offer simple observations based on the data (e.g., "You had a solid focus period this morning," "Looks like 'Slack' took up a significant amount of time today"). Be positive and encouraging.
4.  **Maintain Conversation:** Use the provided chat history to understand the ongoing dialogue.
5.  **Keep it Concise:** Provide brief, clear answers. Avoid overly complex analysis unless specifically asked.
6.  **Data Scope:** Primarily focus your analysis and responses on the provided *daily* statistics and recent conversation. Do not invent historical data beyond what's given. If asked about previous days or trends not in the context, politely state you focus on the current conversation and recent daily data.
7.  **Identity:** Always identify yourself as the Focus Guardian Assistant if asked.
8.  **Tone:** Be friendly, supportive, and slightly analytical.
9.  **Multilingual:** If the user communicates in a language other than English that you understand, please respond in that same language.

Example Interaction (when data is provided):
User: How did I do today?
Assistant (with data context): Based on the latest stats, today you achieved X minutes of focus time and had Y minutes of distraction, resulting in a Z% focus rate. Your top app was [App Name]. Looks like you maintained good focus overall!
`;


// --- Helper Function to Get Today's Stats ---
// (Included here for completeness, move to utils if preferred)
async function getDailyStats(userId) {
    console.log(`Fetching daily stats for userId: ${userId}`);
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todaySessions = await Session.find({
            userId: new mongoose.Types.ObjectId(userId), // Ensure userId is ObjectId
            startTime: { $gte: todayStart }
        }).lean(); // Use lean for performance if not modifying docs

        if (!todaySessions || todaySessions.length === 0) {
            console.log(`No sessions found today for user ${userId}`);
            return {
                totalFocusTime: 0,
                totalDistractionTime: 0,
                focusPercentage: 0,
                topApps: [],
                message: "No session data recorded yet for today."
            };
        }

        let totalFocusTime = 0;
        let totalDistractionTime = 0;
        const combinedAppUsage = new Map();

        todaySessions.forEach(session => {
            totalFocusTime += session.focusTime || 0;
            totalDistractionTime += session.distractionTime || 0;

            // Ensure appUsage exists and is a Map or object before iterating
            if (session.appUsage && (session.appUsage instanceof Map || typeof session.appUsage === 'object')) {
                 // Handle both Map and Object structures (if lean() was used, it's an object)
                 const appEntries = session.appUsage instanceof Map
                    ? Array.from(session.appUsage.entries())
                    : Object.entries(session.appUsage);

                 appEntries.forEach(([appName, time]) => {
                    if (typeof time === 'number') { // Basic validation
                         combinedAppUsage.set(appName, (combinedAppUsage.get(appName) || 0) + time);
                    }
                 });
            }
        });


        const totalTrackedTime = totalFocusTime + totalDistractionTime;
        const focusPercentage = totalTrackedTime > 0 ? Math.round((totalFocusTime / totalTrackedTime) * 100) : 0;

        // Get top N apps (e.g., top 3)
        const sortedApps = Array.from(combinedAppUsage.entries())
            .sort(([, timeA], [, timeB]) => timeB - timeA)
            .slice(0, 3)
            .map(([appName, totalTime]) => ({ appName, totalTime: Math.round(totalTime / 60) })); // Convert seconds to minutes


        console.log(`Calculated daily stats for user ${userId}: Focus=${totalFocusTime}s, Distraction=${totalDistractionTime}s`);
        return {
            totalFocusTime: Math.round(totalFocusTime / 60), // Convert seconds to minutes
            totalDistractionTime: Math.round(totalDistractionTime / 60),
            focusPercentage,
            topApps: sortedApps,
            message: "Stats calculated successfully."
        };

    } catch (error) {
        console.error(`Error fetching daily stats for user ${userId}:`, error);
        // Avoid exposing detailed errors to the LLM context
        return {
            error: true,
            message: "Could not retrieve daily statistics due to an internal error."
        };
    }
}


// --- Core LLM Interaction Function (Periodic Stats Context) ---
async function getChatbotResponse(userId, userMessageContent) {
    console.log(`getChatbotResponse called for user ${userId}`);
    // 1. Retrieve or create ChatHistory
    let chatHistoryDoc = await ChatHistory.findOne({ userId });
    if (!chatHistoryDoc) {
        chatHistoryDoc = new ChatHistory({
            userId,
            systemMessage: { content: systemMessage, timestamp: new Date() },
            messages: []
        });
    }
    // Ensure system message exists in doc (for older records perhaps)
    if (!chatHistoryDoc.systemMessage || !chatHistoryDoc.systemMessage.content) {
        chatHistoryDoc.systemMessage = { content: systemMessage, timestamp: new Date() };
    }

    // 2. Append the user's message to DB history FIRST
    const userMessageForDb = {
        role: "user",
        content: userMessageContent,
        timestamp: new Date()
    };
    chatHistoryDoc.messages.push(userMessageForDb);

    // --- Prepare Conversation Payload for LLM API ---
    const messagesFromDb = chatHistoryDoc.messages;
    const messageCount = messagesFromDb.length; // Current count *including* the message just added

    // Determine if this turn requires a context refresh
    const shouldRefreshContext = (messageCount === 1) || ((messageCount - 1) % REFRESH_INTERVAL === 0 && messageCount > 1);

    let statsContextString = ""; // Will hold formatted stats only if refreshing

    if (shouldRefreshContext) {
        console.log(`Context refresh triggered for message count: ${messageCount}. Fetching daily stats...`);
        const dailyStats = await getDailyStats(userId);

        // Format the stats into a string for the LLM
        statsContextString = "[START CONTEXT FOR AI - TODAY'S PRODUCTIVITY DATA]\n"; // Clear delimiter
        if (dailyStats.error) {
            statsContextString += `Note: ${dailyStats.message}\n`;
        } else if (dailyStats.totalFocusTime === 0 && dailyStats.totalDistractionTime === 0) {
            statsContextString += "No focus session data has been recorded yet for today.\n";
        } else {
            statsContextString += `- Focus Time: ${dailyStats.totalFocusTime} minutes\n`;
            statsContextString += `- Distraction Time: ${dailyStats.totalDistractionTime} minutes\n`;
            statsContextString += `- Focus Percentage: ${dailyStats.focusPercentage}%\n`;
            if (dailyStats.topApps.length > 0) {
                statsContextString += `- Top Apps Used (Time in Minutes): ${dailyStats.topApps.map(app => `${app.appName} (${app.totalTime})`).join(', ')}\n`;
            } else {
                statsContextString += "- Top Apps: No specific app usage recorded or processed yet today.\n";
            }
        }
        statsContextString += "[END CONTEXT FOR AI]"; // End delimiter
    }

    const conversationForLLM = [];

    // Handle the very first message separately
    if (messageCount === 1) {
         console.log("First message, adding initial system prompt and stats.");
         // Use the system prompt from the DB document
         conversationForLLM.push({ role: "system", content: chatHistoryDoc.systemMessage.content });
         // Provide initial stats context as a user message
         conversationForLLM.push({ role: "user", content: `Here is the initial productivity data for today:\n${statsContextString}` });
         // Start with the actual user message
         conversationForLLM.push({ role: "user", content: userMessageContent });
    } else {
        // For subsequent messages:

        // Add system prompt (Groq generally prefers 'system' role)
         conversationForLLM.push({ role: "system", content: chatHistoryDoc.systemMessage.content });

        // Add recent history (user/assistant pairs) up to the limit
        const historyStartIndex = Math.max(0, messagesFromDb.length - 1 - MAX_HISTORY_MESSAGES * 2); // Go back far enough
        const recentDbMessages = messagesFromDb.slice(historyStartIndex, -1); // Exclude the latest user msg

        recentDbMessages.forEach(msg => {
             // Map DB roles to Groq roles ('assistant' -> 'assistant')
             conversationForLLM.push({
                 role: msg.role, // Assuming roles are 'user' or 'assistant' in DB
                 content: msg.content
             });
        });

        // Inject Combined Refresh Context (if needed)
        if (shouldRefreshContext) {
             console.log(`Injecting combined system prompt reminder and stats update.`);
            // Combine reminder AND stats into one *assistant* message (simulating context update)
            // Or keep as user? Let's try user to mimic instruction/data provision.
            const refreshMessageContent = `[SYSTEM NOTE: Refreshing Instructions and Data]\nReminder of your core instructions and updated productivity data for today:\n${statsContextString}`;
            conversationForLLM.push({
                role: "user", // Or system? User seems more direct for instruction/data.
                content: refreshMessageContent
            });
        }

        // Add the LATEST user message
        conversationForLLM.push({
            role: "user",
            content: userMessageContent
        });
    }

    // --- Call the LLM API (Groq Chat Completion) ---
    try {
        console.log(`Sending ${conversationForLLM.length} messages to Groq LLM (${LLM_MODEL})...`);
        // Log payload snippet for debugging (optional)
        // console.log("LLM Payload Snippet:", JSON.stringify(conversationForLLM).substring(0, 500) + "...");

        const chatCompletion = await groq.chat.completions.create({
            messages: conversationForLLM,
            model: LLM_MODEL,
            temperature: 0.7, // Adjust as needed
            // max_tokens: 1024, // Optional limit
            top_p: 1,
            stream: false,
        });

        const botReply = chatCompletion.choices[0]?.message?.content;

        if (!botReply || botReply.trim() === '') {
            console.error("Groq LLM returned empty or null response.");
             // Append a placeholder/error message to DB?
            chatHistoryDoc.messages.push({
                 role: "assistant",
                 content: "[Error: Assistant failed to generate a response]",
                 timestamp: new Date()
            });
            await chatHistoryDoc.save();
            return "Sorry, I couldn't generate a response for that. Please try again.";
        }

        console.log("Groq LLM response received.");

        // Append LLM response to DB history
        chatHistoryDoc.messages.push({
            role: "assistant",
            content: botReply,
            timestamp: new Date(),
        });

        // Save history including the latest user message and the bot reply
        await chatHistoryDoc.save();
        console.log(`Chat history saved for user ${userId}.`);

        return botReply;

    } catch (error) {
        console.error("Error calling Groq LLM API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        let errorMessage = "Sorry, I encountered an error trying to generate a response.";
        if (error.response && error.response.data && error.response.data.error) {
             errorMessage += ` (Details: ${error.response.data.error.message})`;
        }
        // Optionally save error marker to history
        // chatHistoryDoc.messages.push({ role: "assistant", content: `[API Error: ${errorMessage}]`, timestamp: new Date() });
        // await chatHistoryDoc.save(); // Save even on error? Decide policy.
        return errorMessage; // Return error message to user
    }
}


// --- Set up Express Router ---
const router = express.Router();

// --- Multer Setup for Audio Uploads ---
const uploadDir = path.join(__dirname, '../uploads/audio/'); // Place uploads outside controller dir
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Created audio upload directory: ${uploadDir}`);
}
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 40 * 1024 * 1024 } // 40MB limit (matches Groq free tier)
});

// --- Route Handlers ---

// POST /api/chat/converse (Handles Text Input)
router.post('/converse', asyncHandler(async (req, res) => {
    // Assume auth middleware adds req.user
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'User authentication required.' });
    }
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'Message content is required and must be a non-empty string.' });
    }

    console.log(`Processing text message for user ${userId}...`);
    const botResponse = await getChatbotResponse(userId, message.trim());
    res.status(200).json({ reply: botResponse });
}));


// POST /api/chat/converse/audio (Handles Audio Input)
router.post('/converse/audio', upload.single('audio'), asyncHandler(async (req, res) => {
    // Assume auth middleware adds req.user
    if (!req.user || !req.user.id) {
        // Clean up uploaded file if auth fails early
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(401).json({ error: 'User authentication required.' });
    }
     if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const userId = req.user.id;
    const audioFilePath = req.file.path;
    console.log(`Received audio file for user ${userId}: ${audioFilePath}`);

    try {
        // 1. Transcribe Audio using Groq STT
        console.log(`Calling Groq STT API (${STT_MODEL})...`);
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioFilePath),
            model: STT_MODEL,
            response_format: "json", // Get { text: "..." }
        });

        const transcribedText = transcription.text;
        console.log(`Groq STT successful. Transcribed Text: "${transcribedText}"`);

        if (!transcribedText || transcribedText.trim() === '') {
            console.log("Transcription resulted in empty text.");
            return res.status(200).json({ reply: "I couldn't make out any speech in that recording. Could you please try speaking clearly?" });
        }

        // 2. Process transcribed text using the conversational logic
        console.log(`Passing transcribed text to conversational LLM for user ${userId}...`);
        const botResponse = await getChatbotResponse(userId, transcribedText.trim());

        // 3. Send LLM response back
        res.status(200).json({ reply: botResponse });

    } catch (error) {
        console.error("Error during audio processing or STT:", error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ error: 'Failed to process audio message due to an internal error.' }); // User-friendly error
    } finally {
        // Clean up the temporary audio file in all cases
        fs.unlink(audioFilePath, (err) => {
            if (err) console.error(`Error deleting temp audio file ${audioFilePath}:`, err);
            else console.log(`Deleted temp audio file: ${audioFilePath}`);
        });
    }
}));


// GET /api/chat/history (Get chat history for the logged-in user)
router.get('/history', asyncHandler(async (req, res) => {
    // Assume auth middleware adds req.user
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'User authentication required.' });
    }
    const userId = req.user.id;

    console.log(`Fetching chat history for user ${userId}`);
    const chatHistoryDoc = await ChatHistory.findOne({ userId }).lean(); // Use lean for read-only

    // Return only messages, exclude system prompt, etc.
    const messagesToReturn = chatHistoryDoc ? chatHistoryDoc.messages : [];

    res.status(200).json({ messages: messagesToReturn });
}));


// --- Export the router ---
module.exports = router;