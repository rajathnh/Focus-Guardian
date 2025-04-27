// controllers/chatController.js (or routes/chatRoutes.js)

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
const User = require('../models/User'); // Assuming you have a User model for authentication
const Session = require('../models/Session');
const ChatHistory = require('../models/ChatHistory');

// --- Initialize Groq Client ---
if (!process.env.GROQ_API_KEY) {
    console.error("FATAL ERROR: GROQ_API_KEY is not defined in the environment variables.");
    process.exit(1); // Exit if key is missing
}
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Configuration ---
const MAX_HISTORY_MESSAGES = 25;
// Set the LLM model - Deepseek recommended based on previous results
const LLM_MODEL = "llama-3.3-70b-versatile"; // Or "mixtral-8x7b-32768", or specific deepseek like "deepseek-coder-..."
const STT_MODEL = "whisper-large-v3"; // Or other Whisper variants available on Groq

// --- System Prompt for the LLM (Attempt 6 - Robust) ---
const systemMessage = `
You are the Focus Guardian Assistant. Your primary function is to analyze productivity data provided in a system message and report it back to the user objectively.

**--- MANDATORY OPERATING RULES ---**
1.  **Identity:** You are the Focus Guardian Assistant.
// Rule 2 (Response Content) moved/modified later
3.  **Data Source:** A system message labeled 'PRODUCTIVITY UPDATE' containing sections like '**Yesterday's Summary:**', '**Today's Summary:**', '**Last Completed Session:**', '**Current Session Status:**' is **ALWAYS** provided just before the user's message.
4.  **Core Task:** Your main job is to **EXTRACT** data from the PRODUCTIVITY UPDATE context and **PRESENT** it when the user asks.
5.  **Tone:** Be supportive but **strictly objective and data-driven**. Use neutral language for low performance (<60% focus) or short sessions (<5 min). **AVOID subjective praise** like 'great!', 'good start!', 'good effort!' for these cases. Be concise.
6.  **Typos:** If user intent is clear despite minor typos, **IGNORE the typo** and execute the relevant data retrieval task. **DO NOT mention the typo.**

**--- DATA RETRIEVAL RULES ---**
*   **"Yesterday":** MUST use data from '**Yesterday's Summary:**'.
*   **"Today":** MUST use data from '**Today's Summary:**'.
*   **"Summarise" / "How am I doing?":** MUST present data from Yesterday, Today, Last Completed sections. Add a 1-sentence objective observation based ONLY on that data.
*   **!!! CRITICAL RULE for "PREVIOUS SESSION" / "LAST SESSION" !!!**
    *   If the user's query contains "previous session" or "last session" (or clear typos like 'previus sesion', 'last sesion'), your **IMMEDIATE AND ONLY FIRST ACTION** is to:
        1.  Locate the '**Last Completed Session:**' section in the PRODUCTIVITY UPDATE context.
        2.  Extract the data points (Duration, Focus %, Focus Time, Distraction Time, Top App, End Time).
        3.  Present these data points **DIRECTLY** to the user.
    *   **YOU MUST NOT ask "Can you tell me more about it?" or any similar question.** You already have the data. Report it.
*   **No Data:** If a required section says "No session data recorded", state that clearly. DO NOT invent data.

**--- POST-DATA INTERACTION ---**
*   *After* successfully presenting the requested data facts according to the rules above, you *may* ask a brief, relevant follow-up question ("How do you feel about that session?", "What contributed to the distractions?").

**--- FINAL OUTPUT FORMATTING (ABSOLUTELY MANDATORY) ---**
*   Your final response sent to the user **MUST** be clean text only.
*   **DO NOT, UNDER ANY CIRCUMSTANCES,** include internal reasoning, thoughts, plans, or any XML-style tags like <think>, </think>, <rationale>, <internal_monologue>, etc. in the final output.
*   ONLY THE ASSISTANT'S SPEAKING RESPONSE SHOULD BE PRESENT. NO META-COMMENTARY.

**--- Examples (Mandatory Clean Format) ---**
*   **User: how was my previus session?**
    Assistant: The update for the Last Completed Session shows: Ended around [End Time LC], lasted [Duration LC], with [Focus % LC]% focus ([Focus Time LC] focus / [Distraction Time LC] distraction). Top app: [Top App LC]. What are your thoughts on that session's stats?

*   **User: Tell me about the last session.**
    Assistant: The Last Completed Session data is: Ended around [End Time LC], lasted [Duration LC], with [Focus % LC]% focus ([Focus Time LC] focus / [Distraction Time LC] distraction). Top app: [Top App LC]. How did that session feel?

*   **User: Summarise my sessions.**
    Assistant: Summary from the update:
    *   Yesterday: [Data...]
    *   Today: [Data...]
    *   Last Completed: [Data...]
    *   Observation: Recent sessions appear [short/long] with focus varying between X% and Y%. [Optional brief question].

*   **User: hi**
    Assistant: Hello! How can I assist you today?
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

// --- Helper Function to Get Comprehensive Stats ---
async function getComprehensiveStats(userId) {
    console.log(`[Stats Fetch] Starting comprehensive stats fetch for userId: ${userId}`);
    let objectId;
    try {
        objectId = new mongoose.Types.ObjectId(userId);
    } catch (idError) {
        console.error(`[Stats Fetch] Invalid userId format: ${userId}`, idError);
        return { error: "Invalid user identifier." }; // Return error early
    }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
    console.log(`[Stats Fetch] Date Ranges: Today >= ${todayStart.toISOString()}, Yesterday >= ${yesterdayStart.toISOString()} & < ${todayStart.toISOString()}`);

    let todayAggregatedStats = { totalFocusTimeSec: 0, totalDistractionTimeSec: 0, focusPercentage: 0, topAppsToday: [], message: "No session data recorded yet for today." };
    let yesterdayAggregatedStats = { totalFocusTimeSec: 0, totalDistractionTimeSec: 0, focusPercentage: 0, topAppsYesterday: [], message: "No session data recorded for yesterday." };
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
            todaySessions.forEach(session => {
                totalFocusTimeSec += session.focusTime || 0;
                totalDistractionTimeSec += session.distractionTime || 0;
                if (session.appUsage && typeof session.appUsage === 'object') {
                    Object.entries(session.appUsage).forEach(([appName, time]) => {
                        if (typeof time === 'number' && !isNaN(time)) {
                            combinedAppUsage.set(appName, (combinedAppUsage.get(appName) || 0) + time);
                        } else { console.warn(`[Stats Fetch - Today] Invalid time for app '${appName}': ${time}`); }
                    });
                }
            });
            const totalTrackedTimeSec = totalFocusTimeSec + totalDistractionTimeSec;
            todayAggregatedStats = {
                totalFocusTimeSec: totalFocusTimeSec,
                totalDistractionTimeSec: totalDistractionTimeSec,
                focusPercentage: totalTrackedTimeSec > 0 ? Math.round((totalFocusTimeSec / totalTrackedTimeSec) * 100) : 0,
                topAppsToday: Array.from(combinedAppUsage.entries())
                                .sort(([, timeA], [, timeB]) => (timeB || 0) - (timeA || 0))
                                .slice(0, 3)
                                .map(([appName, totalTimeSec]) => ({ appName, totalTimeSec })),
                message: "Stats calculated successfully."
            };
            console.log(`[Stats Fetch] Today's Aggregated: Focus=${formatDuration(todayAggregatedStats.totalFocusTimeSec)}, Distraction=${formatDuration(todayAggregatedStats.totalDistractionTimeSec)}, Focus%=${todayAggregatedStats.focusPercentage}`);
        }

        // --- Process Yesterday's Sessions ---
        if (yesterdaySessions.length > 0) {
             let totalFocusTimeSecY = 0, totalDistractionTimeSecY = 0; const combinedAppUsageY = new Map();
             yesterdaySessions.forEach(session => {
                 totalFocusTimeSecY += session.focusTime || 0;
                 totalDistractionTimeSecY += session.distractionTime || 0;
                 if (session.appUsage && typeof session.appUsage === 'object') {
                     Object.entries(session.appUsage).forEach(([appName, time]) => {
                         if (typeof time === 'number' && !isNaN(time)) {
                             combinedAppUsageY.set(appName, (combinedAppUsageY.get(appName) || 0) + time);
                         } else { console.warn(`[Stats Fetch - Yesterday] Invalid time for app '${appName}': ${time}`); }
                     });
                 }
             });
             const totalTrackedTimeSecY = totalFocusTimeSecY + totalDistractionTimeSecY;
             yesterdayAggregatedStats = {
                 totalFocusTimeSec: totalFocusTimeSecY,
                 totalDistractionTimeSec: totalDistractionTimeSecY,
                 focusPercentage: totalTrackedTimeSecY > 0 ? Math.round((totalFocusTimeSecY / totalTrackedTimeSecY) * 100) : 0,
                 topAppsYesterday: Array.from(combinedAppUsageY.entries())
                                     .sort(([, timeA], [, timeB]) => (timeB || 0) - (timeA || 0))
                                     .slice(0, 3)
                                     .map(([appName, totalTimeSec]) => ({ appName, totalTimeSec })),
                 message: "Stats calculated successfully."
             };
            console.log(`[Stats Fetch] Yesterday's Aggregated: Focus=${formatDuration(yesterdayAggregatedStats.totalFocusTimeSec)}, Distraction=${formatDuration(yesterdayAggregatedStats.totalDistractionTimeSec)}, Focus%=${yesterdayAggregatedStats.focusPercentage}`);
        }

        // --- Process Last Completed Session ---
        if (lastSession) {
            console.log(`[Stats Fetch] Found last completed session: ${lastSession._id}, ended at ${lastSession.endTime}`);
            const durationSeconds = lastSession.endTime && lastSession.startTime ? Math.round((lastSession.endTime.getTime() - lastSession.startTime.getTime()) / 1000) : 0;
            const focusTimeSec = lastSession.focusTime || 0;
            const distractionTimeSec = lastSession.distractionTime || 0;
            const totalTimeSec = focusTimeSec + distractionTimeSec;
            const focusPercentage = totalTimeSec > 0 ? Math.round((focusTimeSec / totalTimeSec) * 100) : 0;
            const appUsageMap = lastSession.appUsage && typeof lastSession.appUsage === 'object' ? new Map(Object.entries(lastSession.appUsage)) : new Map();
            lastCompletedSessionSummary = {
                durationSeconds: durationSeconds,
                focusPercentage: focusPercentage,
                focusTimeSec: focusTimeSec,
                distractionTimeSec: distractionTimeSec,
                appUsageMap: appUsageMap,
                endedAt: lastSession.endTime
            };
            console.log(`[Stats Fetch] Last Session Summary: Duration=${formatDuration(lastCompletedSessionSummary.durationSeconds)}, Focus%=${lastCompletedSessionSummary.focusPercentage}, TopApp=${getTopApp(lastCompletedSessionSummary.appUsageMap)}`);
        } else { console.log("[Stats Fetch] No completed sessions found."); }

        // --- Process Current Active Session ---
        if (activeSession) {
             console.log(`[Stats Fetch] Found active session: ${activeSession._id}, started at ${activeSession.startTime}`);
            const focusTimeSec = activeSession.focusTime || 0; const distractionTimeSec = activeSession.distractionTime || 0;
            currentActiveSessionStatus = {
                startTime: activeSession.startTime,
                focusTimeSec: focusTimeSec,
                distractionTimeSec: distractionTimeSec
            };
             console.log(`[Stats Fetch] Active Session Status: Started=${currentActiveSessionStatus.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, Focus=${formatDuration(currentActiveSessionStatus.focusTimeSec)}, Distraction=${formatDuration(currentActiveSessionStatus.distractionTimeSec)}`);
        } else { console.log("[Stats Fetch] No active session found."); }

    } catch (error) {
        console.error(`[Stats Fetch] Error fetching comprehensive stats for user ${userId}:`, error);
        errorMessage = "Could not retrieve all productivity statistics due to an internal error.";
    }
    console.log("[Stats Fetch] Finished fetching stats.");
    // Return all parts, including potential error message
    return { todayAggregatedStats, yesterdayAggregatedStats, lastCompletedSessionSummary, currentActiveSessionStatus, error: errorMessage };
}


// --- Helper Function to Format Stats for LLM Context ---
function formatStatsContext(stats) {
    // Handle case where stats fetching failed entirely
    if (stats.error && !stats.todayAggregatedStats && !stats.yesterdayAggregatedStats) {
        return `[START CONTEXT FOR AI - PRODUCTIVITY UPDATE]\n**Error:** ${stats.error}\n[END CONTEXT FOR AI]`;
    }

    let context = "[START CONTEXT FOR AI - PRODUCTIVITY UPDATE]\n";

    // Yesterday
    context += "**Yesterday's Summary:**\n";
    if (stats.yesterdayAggregatedStats?.message === "Stats calculated successfully.") {
        context += `- Focus Time: ${formatDuration(stats.yesterdayAggregatedStats.totalFocusTimeSec)}\n`;
        context += `- Distraction Time: ${formatDuration(stats.yesterdayAggregatedStats.totalDistractionTimeSec)}\n`;
        context += `- Overall Focus: ${stats.yesterdayAggregatedStats.focusPercentage}%\n`;
        if (stats.yesterdayAggregatedStats.topAppsYesterday.length > 0) {
            context += `- Top Apps Yesterday: ${stats.yesterdayAggregatedStats.topAppsYesterday.map(app => `${app.appName} (${formatDuration(app.totalTimeSec)})`).join(', ')}\n`;
        } else {
            context += "- Top Apps Yesterday: No specific app usage recorded.\n";
        }
    } else {
        context += `- ${stats.yesterdayAggregatedStats?.message || "Data unavailable"}\n`;
    }

    // Today
    context += "\n**Today's Summary:**\n";
    if (stats.todayAggregatedStats?.message === "Stats calculated successfully.") {
        context += `- Focus Time: ${formatDuration(stats.todayAggregatedStats.totalFocusTimeSec)}\n`;
        context += `- Distraction Time: ${formatDuration(stats.todayAggregatedStats.totalDistractionTimeSec)}\n`;
        context += `- Overall Focus: ${stats.todayAggregatedStats.focusPercentage}%\n`;
        if (stats.todayAggregatedStats.topAppsToday.length > 0) {
            context += `- Top Apps Today: ${stats.todayAggregatedStats.topAppsToday.map(app => `${app.appName} (${formatDuration(app.totalTimeSec)})`).join(', ')}\n`;
        } else {
            context += "- Top Apps Today: No specific app usage recorded.\n";
        }
    } else {
        context += `- ${stats.todayAggregatedStats?.message || "Data unavailable"}\n`;
    }

    // Last Completed
    context += "\n**Last Completed Session:**\n";
    if (stats.lastCompletedSessionSummary) {
        context += `- Duration: ${formatDuration(stats.lastCompletedSessionSummary.durationSeconds)}\n`;
        context += `- Focus Percentage: ${stats.lastCompletedSessionSummary.focusPercentage}%\n`;
        context += `- Focus Time: ${formatDuration(stats.lastCompletedSessionSummary.focusTimeSec)}\n`;
        context += `- Distraction Time: ${formatDuration(stats.lastCompletedSessionSummary.distractionTimeSec)}\n`;
        context += `- Top App: ${getTopApp(stats.lastCompletedSessionSummary.appUsageMap)}\n`;
        context += `- Ended At: ${stats.lastCompletedSessionSummary.endedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}\n`;
    } else {
        context += "- No completed sessions found.\n";
    }

    // Current Active
    context += "\n**Current Session Status:**\n";
    if (stats.currentActiveSessionStatus) {
        context += `- Status: ACTIVE\n`;
        context += `- Started At: ${stats.currentActiveSessionStatus.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}\n`;
        context += `- Focus So Far: ${formatDuration(stats.currentActiveSessionStatus.focusTimeSec)}\n`;
        context += `- Distraction So Far: ${formatDuration(stats.currentActiveSessionStatus.distractionTimeSec)}\n`;
    } else {
        context += "- Status: No session currently active.\n";
    }

    // Include overall error message if present
    if (stats.error) {
        context += `\n**Note:** ${stats.error}\n`;
    }
    context += "[END CONTEXT FOR AI]";
    return context;
}

// --- Core LLM Interaction Function (Non-Streaming - with Cleanup) ---
async function getChatbotResponse(userId, userMessageContent) {
    console.log(`[LLM Process] Start getChatbotResponse for user ${userId}, message: "${userMessageContent.substring(0, 50)}..."`);
    let chatHistoryDoc = await ChatHistory.findOne({ userId });
    if (!chatHistoryDoc) {
        console.log(`[LLM Process] No existing chat history found for user ${userId}, creating new.`);
        chatHistoryDoc = new ChatHistory({ userId, systemMessage: { content: systemMessage, timestamp: new Date() }, messages: [] });
    }
    // Ensure system message is present and up-to-date if needed
    if (!chatHistoryDoc.systemMessage || chatHistoryDoc.systemMessage.content !== systemMessage) {
        console.log(`[LLM Process] Updating system message in DB for user ${userId}.`);
        chatHistoryDoc.systemMessage = { content: systemMessage, timestamp: new Date() };
    }

    // --- Prepare payload and fetch stats ---
    const userMessageForDb = { role: "user", content: userMessageContent, timestamp: new Date() };
    chatHistoryDoc.messages.push(userMessageForDb);

    console.log(`[LLM Process] Fetching comprehensive stats for context...`);
    const comprehensiveStats = await getComprehensiveStats(userId);
    const statsContextString = formatStatsContext(comprehensiveStats);
    console.log("[LLM Process] Generated statsContextString for injection:\n---\n" + statsContextString.substring(0, 300) + "...\n---");

    const conversationForLLM = [];
    // 1. System prompt
    conversationForLLM.push({ role: "system", content: chatHistoryDoc.systemMessage.content });
    // 2. History
    const messagesFromDb = chatHistoryDoc.messages;
    const historyStartIndex = Math.max(0, messagesFromDb.length - 1 - MAX_HISTORY_MESSAGES * 2);
    const recentDbMessages = messagesFromDb.slice(historyStartIndex, -1); // Exclude latest user msg
    console.log(`[LLM Process] Slicing history from index ${historyStartIndex}, adding ${recentDbMessages.length} messages to context.`);
    recentDbMessages.forEach(msg => {
        if (msg && msg.role && msg.content && typeof msg.content === 'string') { // Add type check
             conversationForLLM.push({ role: msg.role, content: msg.content });
        } else {
             console.warn("[LLM Process] Skipping invalid/malformed message in history:", msg);
        }
     });
    // 3. Stats Context
    conversationForLLM.push({ role: "system", content: statsContextString });
    // 4. Latest User Message
    conversationForLLM.push({ role: "user", content: userMessageContent });

    console.log(`[LLM Call] Preparing ${conversationForLLM.length} total messages for Groq LLM (${LLM_MODEL}).`);

    // --- Call LLM API ---
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: conversationForLLM,
            model: LLM_MODEL, // Use the selected model
            temperature: 0.7,
            top_p: 1,
            stream: false, // Explicitly false
        });
        let botReply = chatCompletion.choices[0]?.message?.content; // Get the RAW reply

        if (!botReply || botReply.trim() === '') {
             console.error("[LLM Call] Groq LLM returned empty or null response content.");
             chatHistoryDoc.messages.push({ role: "assistant", content: "[Error: Assistant failed to generate response]", timestamp: new Date() });
             await chatHistoryDoc.save(); // Save user msg + error placeholder
             return "Sorry, I seem to be having trouble formulating a response right now. Please try again.";
        }

        // **** START POST-PROCESSING CLEANUP ****
        console.log(`[LLM Filter] RAW non-stream reply received (length: ${botReply.length}). Checking for <think> tags.`);
        const cleanedReply = botReply.replace(/<think>.*?<\/think>\s*/gsi, '').trim();
        if (/<think>/i.test(cleanedReply)) { // Case-insensitive check if tag REMAINS
            console.error(`[FILTER SLIP!] <think> tag remained after cleaning! Raw: ${JSON.stringify(botReply)}, Cleaned Attempt: ${JSON.stringify(cleanedReply)}`);
        }
        if (!cleanedReply) {
             console.warn(`[LLM Filter] Reply became empty after removing <think> tags. Original raw response started with: "${botReply.substring(0,100)}..."`);
             botReply = "Sorry, I encountered an issue processing the response."; // Assign error to botReply
        } else {
            if (cleanedReply.length < botReply.length) {
                console.log(`[LLM Filter] Removed <think> block(s) from non-stream reply. Cleaned length: ${cleanedReply.length}`);
            }
            botReply = cleanedReply; // Assign the cleaned version back to botReply
        }
        // **** END POST-PROCESSING CLEANUP ****

        // Save and return the potentially cleaned botReply
        console.log(`[LLM Call] Final assistant reply (cleaned, ${botReply.length} chars).`);
        chatHistoryDoc.messages.push({ role: "assistant", content: botReply, timestamp: new Date() });
        await chatHistoryDoc.save(); // Save history AFTER successful call and cleaning
        return botReply; // Return the cleaned reply

    } catch (error) {
        console.error("[LLM Call] Error calling Groq LLM API (non-stream):", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        console.error(error);
        console.error(`[LLM Process] Failed to get response for user ${userId}. Error: ${error.message}`);
        // Optionally save history up to user message if needed
        // await chatHistoryDoc.save();
        return "Sorry, I encountered an error while processing your request. Please try again.";
    }
}

// *** Core LLM Interaction Function for STREAMING (with Post-Processing Cleanup Before Save) ***
async function streamChatbotResponse(userId, userMessageContent, res) {
    console.log(`[Stream Process] Start streamChatbotResponse for user ${userId}, message: "${userMessageContent.substring(0, 50)}..."`);

    let chatHistoryDoc;
    let fullBotResponse = ""; // Accumulate the RAW response from the stream
    let streamErrored = false;

    try {
        // --- 1. Load/Prepare Chat History ---
        chatHistoryDoc = await ChatHistory.findOne({ userId });
        if (!chatHistoryDoc) {
            console.log(`[Stream Process] No existing chat history found for user ${userId}, creating new.`);
            chatHistoryDoc = new ChatHistory({ userId, systemMessage: { content: systemMessage, timestamp: new Date() }, messages: [] });
        }
        if (!chatHistoryDoc.systemMessage || chatHistoryDoc.systemMessage.content !== systemMessage) {
            console.log(`[Stream Process] Updating system message in DB for user ${userId}.`);
            chatHistoryDoc.systemMessage = { content: systemMessage, timestamp: new Date() };
        }

        // --- 2. Append User Message and Save Immediately ---
        const userMessageForDb = { role: "user", content: userMessageContent, timestamp: new Date() };
        chatHistoryDoc.messages.push(userMessageForDb);
        await chatHistoryDoc.save();
        console.log(`[Stream Process] Saved user message for ${userId}. History length now: ${chatHistoryDoc.messages.length}`);

        // --- 3. Fetch Comprehensive Stats ---
        console.log(`[Stream Process] Fetching comprehensive stats for context...`);
        const comprehensiveStats = await getComprehensiveStats(userId);
        const statsContextString = formatStatsContext(comprehensiveStats);
        console.log("[Stream Process] Generated statsContextString for injection:\n---\n" + statsContextString.substring(0, 300) + "...\n---");

        // --- 4. Prepare LLM Payload ---
        const conversationForLLM = [];
        conversationForLLM.push({ role: "system", content: chatHistoryDoc.systemMessage.content }); // System Prompt
        const messagesFromDb = chatHistoryDoc.messages; // History
        const historyStartIndex = Math.max(0, messagesFromDb.length - 1 - MAX_HISTORY_MESSAGES * 2);
        const recentDbMessages = messagesFromDb.slice(historyStartIndex, -1);
        console.log(`[Stream Process] Slicing history from index ${historyStartIndex}, adding ${recentDbMessages.length} messages.`);
        recentDbMessages.forEach(msg => {
            if (msg && msg.role && msg.content && typeof msg.content === 'string') {
                conversationForLLM.push({ role: msg.role, content: msg.content });
            } else { console.warn("[Stream Process] Skipping invalid/malformed message in history:", msg); }
        });
        conversationForLLM.push({ role: "system", content: statsContextString }); // Stats Context
        conversationForLLM.push({ role: "user", content: userMessageContent }); // Latest User Message

        console.log(`[Stream Call] Preparing ${conversationForLLM.length} messages for Groq LLM (${LLM_MODEL}) streaming.`);

        // --- 5. Call Groq LLM API with stream: true ---
        const stream = await groq.chat.completions.create({
            messages: conversationForLLM,
            model: LLM_MODEL,
            temperature: 0.7,
            top_p: 1,
            stream: true,
        });

        // --- 6. Process the Stream Chunks ---
        console.log("[Stream Call] Receiving stream from Groq...");
        for await (const chunk of stream) {
            const contentChunk = chunk.choices[0]?.delta?.content;
            if (contentChunk) {
                fullBotResponse += contentChunk; // Accumulate RAW chunk
                res.write(`data: ${JSON.stringify({ chunk: contentChunk })}\n\n`); // Stream RAW chunk
            }
            if (chunk.choices[0]?.finish_reason) {
                 console.log(`[Stream Call] Stream finished by LLM. Reason: ${chunk.choices[0].finish_reason}`);
                 break;
            }
        }
        console.log(`[Stream Call] Groq stream processing complete. RAW response length: ${fullBotResponse.length}`);

    } catch (error) {
        streamErrored = true;
        console.error("[Stream Call] Error during Groq LLM stream:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        console.error(error);
        if (!res.headersSent) {
             console.warn("[Stream Process] Headers not sent before error occurred. Sending 500.");
             res.status(500).json({ error: "Assistant failed to generate response due to an internal error." });
             res.end();
             return; // Prevent finally block
        } else if (!res.writableEnded) {
             console.log("[Stream Process] Sending SSE error event to client.");
             res.write(`event: error\ndata: ${JSON.stringify({ message: "Assistant failed to generate response." })}\n\n`);
        }
    } finally {
        // --- 7. Signal End of Stream to Frontend ---
        if (!res.writableEnded) {
            console.log("[Stream Process] Sending SSE end event and closing connection.");
            res.write(`event: end\ndata: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        } else {
            console.log("[Stream Process] Stream already ended, skipping final 'end' event.");
        }

        // --- 8. Clean and Save Full Bot Response to DB (AFTER stream ends) ---
        if (!streamErrored && fullBotResponse.trim()) {
            // **** START POST-PROCESSING CLEANUP ****
            let cleanedFullBotResponse = fullBotResponse.replace(/<think>.*?<\/think>\s*/gsi, '').trim();
            // **** END POST-PROCESSING CLEANUP ****
            
            if (!cleanedFullBotResponse) {
                 console.warn(`[Stream Filter] Full reply became empty after removing <think> tags. Original raw response started with: "${fullBotResponse.substring(0,100)}..."`);
                 console.warn(`[Stream Process] Assistant response NOT saved for user ${userId} because it was empty after cleaning.`);
            } else {
                if (cleanedFullBotResponse.length < fullBotResponse.length) {
                    console.log(`[Stream Filter] Removed <think> block(s) from full response before saving. Cleaned length: ${cleanedFullBotResponse.length}`);
                }
                 // Proceed to save the cleaned response
                 try {
                     // Re-fetch doc before saving assistant message for consistency
                     let finalHistoryDoc = await ChatHistory.findOne({ userId });
                     if (finalHistoryDoc) {
                         finalHistoryDoc.messages.push({ role: "assistant", content: cleanedFullBotResponse, timestamp: new Date() });
                         await finalHistoryDoc.save();
                         console.log(`[Stream Process] Saved accumulated *cleaned* assistant response (length: ${cleanedFullBotResponse.length}) for user ${userId}.`);
                     } else {
                         console.error(`[Stream Process] Could not find history doc to save final cleaned bot response for ${userId}.`);
                     }
                 } catch (dbError) {
                     console.error(`[Stream Process] DB Error saving final cleaned assistant response for user ${userId}:`, dbError);
                 }
            }
        } else if (streamErrored) {
            console.warn(`[Stream Process] Assistant response NOT saved for user ${userId} due to stream error.`);
        } else {
            console.warn(`[Stream Process] Assistant response NOT saved for user ${userId} because the initial stream response was empty.`);
        }
    }
}


// --- Audio Message Handling ---
async function handleAudioMessage(req, res) {
    // Auth checks (assume middleware ran)
    if (!req.user || !req.user.id) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) { console.error("Error cleaning up file on auth fail:", e); }
        }
        return res.status(401).json({ error: 'User authentication required.' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const userId = req.user.id;
    const tempFilePath = req.file.path;
    let finalFilePath = tempFilePath; // Path used for STT and cleanup

    console.log(`[Request] POST /converse/audio - User: ${userId}, Temp file: ${tempFilePath}, MimeType: ${req.file.mimetype}`);

    try {
        // --- Rename file to add extension (optional but good practice) ---
        let fileExtension = '.audio'; // Default
        const detectedMimeType = req.file.mimetype;
        if (detectedMimeType) {
             if (detectedMimeType.includes('webm')) fileExtension = '.webm';
             else if (detectedMimeType.includes('ogg')) fileExtension = '.ogg';
             else if (detectedMimeType.includes('wav')) fileExtension = '.wav';
             else if (detectedMimeType.includes('mpeg')) fileExtension = '.mp3';
             else if (detectedMimeType.includes('mp4') || detectedMimeType.includes('m4a')) fileExtension = '.m4a'; // Common for mp4 container
             else if (detectedMimeType.includes('aac')) fileExtension = '.aac';
             else if (detectedMimeType.includes('flac')) fileExtension = '.flac';
        }
        const newFilePath = tempFilePath + fileExtension;

        try {
            console.log(`[File Handling] Attempting rename from ${tempFilePath} to ${newFilePath}`);
            fs.renameSync(tempFilePath, newFilePath);
            finalFilePath = newFilePath; // Use the renamed path
            console.log(`[File Handling] File renamed successfully.`);
        } catch (renameError) {
            console.warn(`[File Handling] Failed to rename temp file: ${renameError.message}. Proceeding with original path: ${tempFilePath}`);
            finalFilePath = tempFilePath; // Use original path if rename fails
        }
        // --- End Rename ---


        // 1. Transcribe Audio using Groq STT
        console.log(`[STT] Calling Groq STT API (${STT_MODEL}) for file: ${finalFilePath}`);
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(finalFilePath),
            model: STT_MODEL,
            response_format: "json",
            // language: "en" // Optional: Specify language
        });

        const transcribedText = transcription?.text;
        let userSaidText = "";
        let botResponseText = "";

        // Check transcription result
        if (!transcribedText || transcribedText.trim() === '') {
            console.log("[STT] Transcription resulted in empty text.");
            userSaidText = "[Audio input unclear]"; // Placeholder for UI
            botResponseText = "I couldn't make out any speech in that recording. Could you please try speaking clearly?";
            // Send the response for unclear audio (don't call LLM)
            res.status(200).json({
                 transcribedText: userSaidText,
                 reply: botResponseText
            });

        } else {
            // Transcription successful
            userSaidText = transcribedText.trim();
            console.log(`[STT] Groq STT successful. Text (${userSaidText.length} chars): "${userSaidText.substring(0, 100)}..."`);
            console.log(`[Request] Passing transcribed text to non-streaming chatbot logic for user ${userId}...`);

            // Call the non-streaming chatbot logic (which includes cleanup)
            botResponseText = await getChatbotResponse(userId, userSaidText);

            // Send BOTH the user's transcribed text AND the bot's reply
            res.status(200).json({
                 transcribedText: userSaidText,
                 reply: botResponseText // This should already be cleaned by getChatbotResponse
            });
        }

    } catch (error) {
        console.error("[STT/Audio Error] Error during audio processing or STT:", error.response ? JSON.stringify(error.response.data) : error.message);
        console.error(error);
        res.status(500).json({ error: 'Failed to process audio message due to an internal server error.' });

    } finally {
        // Cleanup the audio file
        fs.unlink(finalFilePath, (err) => {
            if (err) {
                 if (err.code === 'ENOENT') {
                     console.log(`[Cleanup] Audio file ${finalFilePath} not found for deletion (already deleted or did not exist).`);
                 } else {
                     console.error(`[Cleanup] Error deleting audio file ${finalFilePath}:`, err);
                 }
            } else {
                console.log(`[Cleanup] Deleted audio file: ${finalFilePath}`);
            }
            // Attempt cleanup of original path if rename failed and original exists
             if (finalFilePath !== tempFilePath && fs.existsSync(tempFilePath)) {
                 fs.unlink(tempFilePath, (err2) => {
                     if(err2 && err2.code !== 'ENOENT') console.error(`[Cleanup] Error deleting original temp audio file ${tempFilePath} after failed rename:`, err2);
                     else if (!err2) console.log(`[Cleanup] Deleted original temp audio file ${tempFilePath} after rename error.`);
                 });
             }
        });
    }
}

// --- Set up Express Router ---
const router = express.Router();

// --- Multer Setup ---
const uploadDir = path.join(__dirname, '../uploads/audio/'); // Ensure this directory exists or is created
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log(`[Setup] Created audio upload directory: ${uploadDir}`);
    } catch (mkdirError) {
        console.error(`[Setup] FATAL ERROR: Could not create audio upload directory ${uploadDir}. Check permissions/path.`, mkdirError);
        process.exit(1);
    }
}
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 40 * 1024 * 1024 } // 40MB limit
});

// --- Route Handlers ---

// POST /api/chat/converse (Standard text request/response)
// Assumes authentication middleware (like protect) runs before this route
router.post('/converse', asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required.' }); // Defensive check
    const userId = req.user.id;
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ error: 'Message content is required.' });

    console.log(`[Request] POST /converse - User: ${userId}, Message: "${message.substring(0, 50)}..."`);
    // Calls the non-streaming function which includes cleanup
    const botResponse = await getChatbotResponse(userId, message.trim());
    res.status(200).json({ reply: botResponse });
}));

// POST /api/chat/converse/stream (Streaming text request/response using SSE)
// Assumes authentication middleware runs before this route
router.post('/converse/stream', asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required.' }); // Defensive check
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'Message content is required.' });
    }
    const userMessageContent = message.trim();
    console.log(`[Request] POST /converse/stream - User: ${userId}, Message: "${userMessageContent.substring(0, 50)}..."`);

    // Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Useful for Nginx/proxy environments
    res.flushHeaders(); // Send headers immediately

    // Call the streaming logic function (which handles cleanup before saving)
    await streamChatbotResponse(userId, userMessageContent, res);
    // Note: streamChatbotResponse calls res.end() internally
}));

// POST /api/chat/converse/audio (Audio upload, transcribe, standard text response)
// Assumes authentication middleware runs before this route
// Applies multer middleware specifically to this route
router.post('/converse/audio', upload.single('audio'), asyncHandler(handleAudioMessage));

// GET /api/chat/history (Retrieve chat history)
// Assumes authentication middleware runs before this route
router.get('/history', asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required.' }); // Defensive check
    const userId = req.user.id;
    console.log(`[Request] GET /history - User: ${userId}`);
    try {
        const chatHistoryDoc = await ChatHistory.findOne({ userId })
                                                .select('messages -_id')
                                                .lean();

        let messagesToReturn = [];
        if (chatHistoryDoc && Array.isArray(chatHistoryDoc.messages)) {
            // Ensure messages are sorted correctly and only essential fields returned
            messagesToReturn = chatHistoryDoc.messages
                .filter(msg => msg && msg.role && typeof msg.content === 'string') // Basic validation
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) // Sort by timestamp
                .map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    // timestamp: msg.timestamp // Keep timestamp if needed by frontend
                }));
        }

        console.log(`[Request] Found ${messagesToReturn.length} messages in history for user ${userId}.`);
        res.status(200).json({ messages: messagesToReturn });
    } catch(dbError) {
        console.error(`[DB Error] Error fetching chat history for user ${userId}:`, dbError);
        res.status(500).json({ error: 'Failed to retrieve chat history.' });
    }
}));

// --- Export the router ---
module.exports = router; // Ensure this is required correctly in your main app file (e.g., app.js or server.js)