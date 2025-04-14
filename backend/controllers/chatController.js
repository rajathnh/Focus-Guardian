// controllers/chatController.js (or routes/chatRoutes.js if you prefer)

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
    console.error("FATAL ERROR: GROQ_API_KEY is not defined in the environment variables.");
    process.exit(1); // Exit if key is missing
}
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Configuration ---
const MAX_HISTORY_MESSAGES = 25; // Keep increased history context
// REFRESH_INTERVAL is removed as context is sent always
const LLM_MODEL = "llama3-8b-8192"; // Or "mixtral-8x7b-32768"
const STT_MODEL = "whisper-large-v3-turbo"; // Groq STT model

// --- System Prompt for the LLM ---
// --- REFINED System Prompt (Improved Flow & Friendliness) ---
// --- ***** REVISED System Prompt (More Realistic Tone) ***** ---
const systemMessage = `
You are the Focus Guardian Assistant, a helpful AI companion integrated within the Focus Guardian application. Your primary goal is to help users reflect on their productivity patterns, offering **objective insights, encouragement, and constructive feedback** based on collected data.

**--- Core Identity & Behavior ---**
1.  **Your Identity:** You are the Focus Guardian Assistant.
2.  **Greeting:** When the user starts the chat or sends a simple greeting (like 'hi', 'hello'), introduce yourself briefly and ask how you can help. Do NOT immediately summarize all productivity data unless the user explicitly asks for it.
3.  **Tone:** Be friendly, supportive, and analytical. Provide encouragement, but also offer **objective, realistic observations based on the data's scale and context.** Acknowledge both strengths (like high focus percentages) and areas for improvement (like short durations or high distraction). Be direct but constructive. Avoid overly enthusiastic praise for minimal achievements (e.g., very short focus sessions). Keep responses concise.
4.  **Multilingual:** If the user communicates in a language other than English that you understand, respond in that same language.
5.  **Data Source:** You will receive a productivity update message (role 'system') in the context of each API call. This contains data for Yesterday, Today, Last Completed Session, and Current Session Status. **Always use the specific, real values from THIS update when discussing performance.** Do NOT use placeholders like 'X', 'Y', '[App Name]', etc., unless the data explicitly says 'N/A' or 'No data available'.
6.  **Data Usage:** Use the provided data context primarily when the user asks direct questions about their performance or stats. Refer to the data context to answer accurately.
7.  **Offering Insights:** Offer simple observations based on the data *when relevant*. **Critically consider both focus *percentage* AND focus *duration*.** Acknowledge high focus percentages, but if the duration is very short (e.g., under a few minutes), frame it realistically (e.g., "a brief moment of concentration," "good focus during that short period") rather than as a major accomplishment. If distraction time is high or focus % is low, point it out constructively and ask follow-up questions.
8.  **Engaging Questions:** Ask open-ended follow-up questions to encourage reflection (e.g., "What do you think contributed to the distractions?", "That was a short session, was it just a quick check?", "How could you extend focus periods like that one?").
9.  **No Data Scenario:** If the data context indicates "No session data recorded" for a period the user asks about, state that clearly and politely. Do not invent data.

**--- Example Conversational Snippets (Use Actual Data & Realistic Tone) ---**

*   **User Asks "How did I do yesterday?":**
    Assistant: Okay, checking yesterday's update: you had [Actual Focus Time Yesterday] of focus against [Actual Distraction Time Yesterday] of distraction, giving an overall focus of [Actual Focus % Yesterday]%. Your top app used was [Actual Top App Yesterday]. That [Focus %] is quite [positive adjective like 'solid' or 'good', or neutral 'notable' if low], although the total time tracked was [mention if total time was low or high]. How do you feel about that balance?

*   **User Asks about a Very Short Session (e.g., 8 seconds):**
    Assistant: That last session was very brief, just 8 seconds on WhatsApp. You maintained 100% focus during that short moment, which shows you can concentrate quickly. However, an 8-second session doesn't represent a significant work block. Was that just a quick check-in?

*   **User Asks about a Session with Low Focus %:**
    Assistant: Looking at your last completed session, it lasted [Duration] but the focus percentage was [Low Focus %]%. It seems distractions took up a significant portion of that time, with [Top Distraction App/Activity if available] being prominent. What do you think was happening during that session?
`;


// --- Helper Function: Format Seconds to Readable String ---
function formatDuration(totalSeconds) {
    if (totalSeconds === undefined || totalSeconds === null || isNaN(totalSeconds)) return 'N/A';
    totalSeconds = Math.round(totalSeconds);
    if (totalSeconds < 0) totalSeconds = 0;
    if (totalSeconds < 60) { return `${totalSeconds}s`; }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) { return `${minutes}m`; }
    return `${minutes}m ${seconds}s`;
}

// --- Helper Function: Get Top App from Usage Map ---
function getTopApp(appUsageMap) {
    if (!appUsageMap || !(appUsageMap instanceof Map) || appUsageMap.size === 0) { return "N/A"; }
    try {
        const sortedApps = [...appUsageMap.entries()].sort(([, timeA], [, timeB]) => (timeB || 0) - (timeA || 0));
        if (sortedApps.length > 0 && sortedApps[0][0]) {
            const [appName, time] = sortedApps[0];
            return `${appName} (${formatDuration(time)})`;
        }
    } catch (e) { console.error("Error processing appUsageMap in getTopApp:", e, appUsageMap); return "Error"; }
    return "N/A";
}

// --- Helper Function to Get Richer Stats (includes YESTERDAY) ---
async function getComprehensiveStats(userId) {
    console.log(`[Stats Fetch] Starting comprehensive stats fetch for userId: ${userId}`);
    const objectId = new mongoose.Types.ObjectId(userId);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
    console.log(`[Stats Fetch] Date Ranges: Today >= ${todayStart.toISOString()}, Yesterday >= ${yesterdayStart.toISOString()} & < ${todayStart.toISOString()}`);

    let todayAggregatedStats = { totalFocusTimeMinutes: 0, totalDistractionTimeMinutes: 0, focusPercentage: 0, topAppsToday: [], message: "No session data recorded yet for today." };
    let yesterdayAggregatedStats = { totalFocusTimeMinutes: 0, totalDistractionTimeMinutes: 0, focusPercentage: 0, topAppsYesterday: [], message: "No session data recorded for yesterday." };
    let lastCompletedSessionSummary = null;
    let currentActiveSessionStatus = null;
    let errorMessage = null;

    try {
        // --- Query Sessions Concurrently ---
        const [todaySessions, yesterdaySessions, lastSession, activeSession] = await Promise.all([
            Session.find({ userId: objectId, startTime: { $gte: todayStart } }).lean(),
            Session.find({ userId: objectId, startTime: { $gte: yesterdayStart, $lt: todayStart } }).lean(),
            Session.findOne({ userId: objectId, endTime: { $ne: null } }).sort({ endTime: -1 }).lean(),
            Session.findOne({ userId: objectId, endTime: null }).lean()
        ]);
        console.log(`[Stats Fetch] Found ${todaySessions.length} sessions for today.`);
        console.log(`[Stats Fetch] Found ${yesterdaySessions.length} sessions for yesterday.`);

        // --- Process Today's Sessions ---
        if (todaySessions.length > 0) {
            let totalFocusTimeSec = 0, totalDistractionTimeSec = 0; const combinedAppUsage = new Map();
            todaySessions.forEach(session => { totalFocusTimeSec += session.focusTime || 0; totalDistractionTimeSec += session.distractionTime || 0; if (session.appUsage && typeof session.appUsage === 'object') { Object.entries(session.appUsage).forEach(([appName, time]) => { if (typeof time === 'number' && !isNaN(time)) { combinedAppUsage.set(appName, (combinedAppUsage.get(appName) || 0) + time); } else { console.warn(`[Stats Fetch - Today] Invalid time for app '${appName}': ${time}`); } }); } });
            const totalTrackedTimeSec = totalFocusTimeSec + totalDistractionTimeSec;
            todayAggregatedStats = { totalFocusTimeMinutes: Math.round(totalFocusTimeSec / 60), totalDistractionTimeMinutes: Math.round(totalDistractionTimeSec / 60), focusPercentage: totalTrackedTimeSec > 0 ? Math.round((totalFocusTimeSec / totalTrackedTimeSec) * 100) : 0, topAppsToday: Array.from(combinedAppUsage.entries()).sort(([, timeA], [, timeB]) => (timeB || 0) - (timeA || 0)).slice(0, 3).map(([appName, totalTimeSec]) => ({ appName, totalTimeMinutes: Math.round(totalTimeSec / 60) })), message: "Stats calculated successfully." };
            console.log(`[Stats Fetch] Today's Aggregated: Focus=${todayAggregatedStats.totalFocusTimeMinutes}m, Distraction=${todayAggregatedStats.totalDistractionTimeMinutes}m, Focus%=${todayAggregatedStats.focusPercentage}`);
        }

        // --- Process Yesterday's Sessions ---
        if (yesterdaySessions.length > 0) {
             let totalFocusTimeSecY = 0, totalDistractionTimeSecY = 0; const combinedAppUsageY = new Map();
             yesterdaySessions.forEach(session => { totalFocusTimeSecY += session.focusTime || 0; totalDistractionTimeSecY += session.distractionTime || 0; if (session.appUsage && typeof session.appUsage === 'object') { Object.entries(session.appUsage).forEach(([appName, time]) => { if (typeof time === 'number' && !isNaN(time)) { combinedAppUsageY.set(appName, (combinedAppUsageY.get(appName) || 0) + time); } else { console.warn(`[Stats Fetch - Yesterday] Invalid time for app '${appName}': ${time}`); } }); } });
             const totalTrackedTimeSecY = totalFocusTimeSecY + totalDistractionTimeSecY;
             yesterdayAggregatedStats = { totalFocusTimeMinutes: Math.round(totalFocusTimeSecY / 60), totalDistractionTimeMinutes: Math.round(totalDistractionTimeSecY / 60), focusPercentage: totalTrackedTimeSecY > 0 ? Math.round((totalFocusTimeSecY / totalTrackedTimeSecY) * 100) : 0, topAppsYesterday: Array.from(combinedAppUsageY.entries()).sort(([, timeA], [, timeB]) => (timeB || 0) - (timeA || 0)).slice(0, 3).map(([appName, totalTimeSec]) => ({ appName, totalTimeMinutes: Math.round(totalTimeSec / 60) })), message: "Stats calculated successfully." };
            console.log(`[Stats Fetch] Yesterday's Aggregated: Focus=${yesterdayAggregatedStats.totalFocusTimeMinutes}m, Distraction=${yesterdayAggregatedStats.totalDistractionTimeMinutes}m, Focus%=${yesterdayAggregatedStats.focusPercentage}`);
        }

        // --- Process Last Completed Session ---
        if (lastSession) {
            console.log(`[Stats Fetch] Found last completed session: ${lastSession._id}, ended at ${lastSession.endTime}`);
            const durationSeconds = lastSession.endTime && lastSession.startTime ? Math.round((lastSession.endTime.getTime() - lastSession.startTime.getTime()) / 1000) : 0;
            const focusTimeSec = lastSession.focusTime || 0; const distractionTimeSec = lastSession.distractionTime || 0; const totalTimeSec = focusTimeSec + distractionTimeSec; const focusPercentage = totalTimeSec > 0 ? Math.round((focusTimeSec / totalTimeSec) * 100) : 0; const appUsageMap = lastSession.appUsage && typeof lastSession.appUsage === 'object' ? new Map(Object.entries(lastSession.appUsage)) : new Map();
            lastCompletedSessionSummary = { duration: formatDuration(durationSeconds), focusPercentage: focusPercentage, topApp: getTopApp(appUsageMap), endedAt: lastSession.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
            console.log(`[Stats Fetch] Last Session Summary: Duration=${lastCompletedSessionSummary.duration}, Focus%=${lastCompletedSessionSummary.focusPercentage}, TopApp=${lastCompletedSessionSummary.topApp}`);
        } else { console.log("[Stats Fetch] No completed sessions found."); }

        // --- Process Current Active Session ---
        if (activeSession) {
             console.log(`[Stats Fetch] Found active session: ${activeSession._id}, started at ${activeSession.startTime}`);
            const focusTimeSec = activeSession.focusTime || 0; const distractionTimeSec = activeSession.distractionTime || 0;
            currentActiveSessionStatus = { startTime: activeSession.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), focusTimeSoFar: formatDuration(focusTimeSec), distractionTimeSoFar: formatDuration(distractionTimeSec) };
             console.log(`[Stats Fetch] Active Session Status: Started=${currentActiveSessionStatus.startTime}, Focus=${currentActiveSessionStatus.focusTimeSoFar}, Distraction=${currentActiveSessionStatus.distractionTimeSoFar}`);
        } else { console.log("[Stats Fetch] No active session found."); }

    } catch (error) {
        console.error(`[Stats Fetch] Error fetching comprehensive stats for user ${userId}:`, error);
        errorMessage = "Could not retrieve all productivity statistics due to an internal error.";
    }
    console.log("[Stats Fetch] Finished fetching stats.");
    return { todayAggregatedStats, yesterdayAggregatedStats, lastCompletedSessionSummary, currentActiveSessionStatus, error: errorMessage };
}


// --- Core LLM Interaction Function (Always Sends Context) ---
async function getChatbotResponse(userId, userMessageContent) {
    console.log(`[LLM Process] Start getChatbotResponse for user ${userId}, message: "${userMessageContent.substring(0,50)}..."`);
    let chatHistoryDoc = await ChatHistory.findOne({ userId });
    if (!chatHistoryDoc) {
         console.log(`[LLM Process] No existing chat history found for user ${userId}, creating new.`);
        chatHistoryDoc = new ChatHistory({ userId, systemMessage: { content: systemMessage, timestamp: new Date() }, messages: [] });
    }
    if (!chatHistoryDoc.systemMessage || !chatHistoryDoc.systemMessage.content) {
        chatHistoryDoc.systemMessage = { content: systemMessage, timestamp: new Date() };
    }

    // Append user message to DB FIRST
    const userMessageForDb = { role: "user", content: userMessageContent, timestamp: new Date() };
    chatHistoryDoc.messages.push(userMessageForDb);

    // --- Fetch Comprehensive Stats *Every Time* ---
    console.log(`[LLM Process] Fetching comprehensive stats for context...`);
    const comprehensiveStats = await getComprehensiveStats(userId);

    // --- Format the stats string *Every Time* ---
    let statsContextString = "[START CONTEXT FOR AI - PRODUCTIVITY UPDATE]\n";
    // Yesterday
    statsContextString += "**Yesterday's Summary:**\n";
    if (comprehensiveStats.yesterdayAggregatedStats.message === "Stats calculated successfully.") {
        statsContextString += `- Focus Time: ${comprehensiveStats.yesterdayAggregatedStats.totalFocusTimeMinutes} minutes\n`;
        statsContextString += `- Distraction Time: ${comprehensiveStats.yesterdayAggregatedStats.totalDistractionTimeMinutes} minutes\n`;
        statsContextString += `- Overall Focus: ${comprehensiveStats.yesterdayAggregatedStats.focusPercentage}%\n`;
        if (comprehensiveStats.yesterdayAggregatedStats.topAppsYesterday.length > 0) { statsContextString += `- Top Apps Yesterday: ${comprehensiveStats.yesterdayAggregatedStats.topAppsYesterday.map(app => `${app.appName} (${app.totalTimeMinutes}m)`).join(', ')}\n`; }
        else { statsContextString += "- Top Apps Yesterday: No specific app usage recorded.\n"; }
    } else { statsContextString += `- ${comprehensiveStats.yesterdayAggregatedStats.message}\n`; }
    // Today
    statsContextString += "\n**Today's Summary:**\n";
    if(comprehensiveStats.todayAggregatedStats.message === "Stats calculated successfully.") {
        statsContextString += `- Focus Time: ${comprehensiveStats.todayAggregatedStats.totalFocusTimeMinutes} minutes\n`;
        statsContextString += `- Distraction Time: ${comprehensiveStats.todayAggregatedStats.totalDistractionTimeMinutes} minutes\n`;
        statsContextString += `- Overall Focus: ${comprehensiveStats.todayAggregatedStats.focusPercentage}%\n`;
        if (comprehensiveStats.todayAggregatedStats.topAppsToday.length > 0) { statsContextString += `- Top Apps Today: ${comprehensiveStats.todayAggregatedStats.topAppsToday.map(app => `${app.appName} (${app.totalTimeMinutes}m)`).join(', ')}\n`; }
        else { statsContextString += "- Top Apps Today: No specific app usage recorded.\n"; }
    } else { statsContextString += `- ${comprehensiveStats.todayAggregatedStats.message}\n`; }
    // Last Completed
    statsContextString += "\n**Last Completed Session:**\n";
    if (comprehensiveStats.lastCompletedSessionSummary) {
        statsContextString += `- Duration: ${comprehensiveStats.lastCompletedSessionSummary.duration}\n`;
        statsContextString += `- Focus Percentage: ${comprehensiveStats.lastCompletedSessionSummary.focusPercentage}%\n`;
        statsContextString += `- Top App: ${comprehensiveStats.lastCompletedSessionSummary.topApp}\n`;
        statsContextString += `- Ended At: ${comprehensiveStats.lastCompletedSessionSummary.endedAt}\n`;
    } else { statsContextString += "- No completed sessions found.\n"; }
    // Current Active
    statsContextString += "\n**Current Session Status:**\n";
    if (comprehensiveStats.currentActiveSessionStatus) {
        statsContextString += `- Status: ACTIVE\n`;
        statsContextString += `- Started At: ${comprehensiveStats.currentActiveSessionStatus.startTime}\n`;
        statsContextString += `- Focus So Far: ${comprehensiveStats.currentActiveSessionStatus.focusTimeSoFar}\n`;
        statsContextString += `- Distraction So Far: ${comprehensiveStats.currentActiveSessionStatus.distractionTimeSoFar}\n`;
    } else { statsContextString += "- Status: No session currently active.\n"; }
    // Error
    if (comprehensiveStats.error) { statsContextString += `\n**Note:** ${comprehensiveStats.error}\n`; }
    statsContextString += "[END CONTEXT FOR AI]";
    console.log("[LLM Process] Generated statsContextString for injection:\n---\n" + statsContextString + "\n---");


    // --- Prepare Payload for LLM ---
    const conversationForLLM = [];
    // 1. Main system prompt
    conversationForLLM.push({ role: "system", content: chatHistoryDoc.systemMessage.content });
    // 2. **Inject Stats Context *Every Time***
    console.log(`[LLM Process] Injecting comprehensive stats update as 'system' message.`);
    conversationForLLM.push({
        role: "system",
        content: statsContextString // Inject the freshly formatted data
    });
    // 3. Add recent history messages (comes AFTER system prompts)
    const messagesFromDb = chatHistoryDoc.messages;
    const historyStartIndex = Math.max(0, messagesFromDb.length - 1 - MAX_HISTORY_MESSAGES * 2); // Use constant
    const recentDbMessages = messagesFromDb.slice(historyStartIndex, -1); // Exclude latest user msg
    console.log(`[LLM Process] Slicing history from index ${historyStartIndex}, adding ${recentDbMessages.length} messages to context.`);
    recentDbMessages.forEach(msg => { if (msg && msg.role && msg.content) { conversationForLLM.push({ role: msg.role, content: msg.content }); } else { console.warn("[LLM Process] Skipping invalid message in history:", msg); } });
    // 4. Add the LATEST user message (comes last)
    conversationForLLM.push({ role: "user", content: userMessageContent });

    // --- Logging Payload Summary ---
    console.log(`[LLM Call] Preparing ${conversationForLLM.length} total messages for Groq LLM (${LLM_MODEL}).`);

    // --- Call LLM API ---
    try {
        const chatCompletion = await groq.chat.completions.create({ messages: conversationForLLM, model: LLM_MODEL, temperature: 0.7, top_p: 1, stream: false, });
        const botReply = chatCompletion.choices[0]?.message?.content;
        if (!botReply || botReply.trim() === '') {
             console.error("[LLM Call] Groq LLM returned empty or null response content.");
             chatHistoryDoc.messages.push({ role: "assistant", content: "[Error: Assistant failed to generate response]", timestamp: new Date() });
             await chatHistoryDoc.save(); // Save even on error to capture user msg
             return "Sorry, I seem to be having trouble formulating a response right now. Please try again.";
        }
        console.log(`[LLM Call] Groq LLM response received (${botReply.length} chars).`);
        chatHistoryDoc.messages.push({ role: "assistant", content: botReply, timestamp: new Date() });
        await chatHistoryDoc.save(); // Save history AFTER successful call
        console.log(`[LLM Process] Chat history saved successfully for user ${userId}.`);
        return botReply;
    } catch (error) {
        console.error("[LLM Call] Error calling Groq LLM API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        console.error(`[LLM Process] Failed to get response for user ${userId}. Error: ${error.message}`);
        // Don't save history here as the bot didn't reply successfully
        return "Sorry, I encountered an error while processing your request. Please try again.";
    }
}


// --- Set up Express Router ---
const router = express.Router();

// --- Multer Setup ---
const uploadDir = path.join(__dirname, '../uploads/audio/');
if (!fs.existsSync(uploadDir)) { try { fs.mkdirSync(uploadDir, { recursive: true }); console.log(`[Setup] Created audio upload directory: ${uploadDir}`); } catch (mkdirError) { console.error(`[Setup] FATAL ERROR: Could not create audio upload directory ${uploadDir}. Please check permissions.`, mkdirError); process.exit(1); } }
const upload = multer({ dest: uploadDir, limits: { fileSize: 40 * 1024 * 1024 } });


// --- Route Handlers ---
router.post('/converse', asyncHandler(async (req, res) => { /* ... Text Handler ... */
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required.' });
    const userId = req.user.id; const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ error: 'Message content is required.' });
    console.log(`[Request] POST /converse - User: ${userId}, Message: "${message.substring(0, 50)}..."`);
    const botResponse = await getChatbotResponse(userId, message.trim());
    res.status(200).json({ reply: botResponse });
}));
router.post('/converse/audio', upload.single('audio'), asyncHandler(async (req, res) => { /* ... Audio Handler ... */
    if (!req.user || !req.user.id) { if (req.file) fs.unlinkSync(req.file.path); return res.status(401).json({ error: 'User authentication required.' }); }
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });
    const userId = req.user.id; const audioFilePath = req.file.path;
    console.log(`[Request] POST /converse/audio - User: ${userId}, File received: ${audioFilePath}`);
    try {
        console.log(`[STT] Calling Groq STT API (${STT_MODEL}) for file: ${audioFilePath}`);
        const transcription = await groq.audio.transcriptions.create({ file: fs.createReadStream(audioFilePath), model: STT_MODEL, response_format: "json", });
        const transcribedText = transcription?.text;
        if (!transcribedText || transcribedText.trim() === '') { console.log("[STT] Transcription resulted in empty text."); res.status(200).json({ reply: "I couldn't make out any speech in that recording. Could you please try speaking clearly?" }); }
        else {
            console.log(`[STT] Groq STT successful. Transcribed Text (${transcribedText.length} chars): "${transcribedText.substring(0, 100)}..."`);
            console.log(`[Request] Passing transcribed text to chatbot logic for user ${userId}...`);
            const botResponse = await getChatbotResponse(userId, transcribedText.trim());
            res.status(200).json({ reply: botResponse });
        }
    } catch (error) { console.error("[STT/Audio Error] Error during audio processing or STT:", error.response ? JSON.stringify(error.response.data) : error.message); res.status(500).json({ error: 'Failed to process audio message due to an internal server error.' }); }
    finally { fs.unlink(audioFilePath, (err) => { if (err) console.error(`[Cleanup] Error deleting temp audio file ${audioFilePath}:`, err); else console.log(`[Cleanup] Deleted temp audio file: ${audioFilePath}`); }); }
}));
router.get('/history', asyncHandler(async (req, res) => { /* ... History Handler ... */
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required.' });
    const userId = req.user.id;
    console.log(`[Request] GET /history - User: ${userId}`);
    try {
        const chatHistoryDoc = await ChatHistory.findOne({ userId }).lean();
        const messagesToReturn = chatHistoryDoc ? (chatHistoryDoc.messages || []) : [];
        console.log(`[Request] Found ${messagesToReturn.length} messages in history for user ${userId}.`);
        res.status(200).json({ messages: messagesToReturn });
    } catch(dbError) { console.error(`[DB Error] Error fetching chat history for user ${userId}:`, dbError); res.status(500).json({ error: 'Failed to retrieve chat history.' }); }
}));

// --- Export the router ---
module.exports = router; // Ensure this file is required as the router in app.js