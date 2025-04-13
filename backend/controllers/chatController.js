// controllers/chatController.js

const asyncHandler = require('express-async-handler');
const Groq = require('groq-sdk');
const Session = require('../models/Session');
const User = require('../models/User');

// Initialize Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Define the Chatbot Persona ---
const systemPrompt = `You are FocusBot, a friendly and supportive productivity assistant integrated into a focus tracking application. Your goal is to help users understand their work patterns, provide helpful tips, or answer general questions based on the context provided and their message. Keep your tone positive and conversational. Speak directly to the user ("you"). Keep responses concise unless asked for detail. Introduce yourself if the user sends greeting message. `;

// --- Helper Function for formatting duration ---
function formatDuration(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) return `${minutes}m`;
    return `${minutes}m ${seconds}s`;
}

// --- Helper Function to Format Context Data ---
// Takes session objects and returns formatted strings, handling nulls
function formatContextForLLM(currentSession, lastSession) {
    let currentStatusContext = "Current Session Status: No active session found.";
    if (currentSession) {
        const focusTime = currentSession.focusTime || 0;
        const distractionTime = currentSession.distractionTime || 0;
        const totalTime = focusTime + distractionTime;
        const focusPercentage = (totalTime > 0) ? Math.round((focusTime / totalTime) * 100) : 0;
        let statusString = `Current Session Status (Started: ${currentSession.startTime.toLocaleTimeString()}): Focus: ${formatDuration(focusTime)}, Distraction: ${formatDuration(distractionTime)}, Overall Focus: ${focusPercentage}%.`;
        if (currentSession.appUsage && currentSession.appUsage.size > 0) {
            const topApp = [...currentSession.appUsage.entries()].sort((a, b) => b[1] - a[1])[0];
            statusString += ` Top App: ${topApp[0]} (${formatDuration(topApp[1])}).`;
        } else {
            statusString += ` No specific app usage tracked yet.`;
        }
        currentStatusContext = statusString;
    }

    let lastSummaryContext = "Last Session Summary: No completed sessions found.";
    if (lastSession) {
        const duration = formatDuration(Math.round((lastSession.endTime - lastSession.startTime) / 1000));
        const focusTime = formatDuration(lastSession.focusTime || 0);
        const distractionTime = formatDuration(lastSession.distractionTime || 0);
        const totalTracked = (lastSession.focusTime || 0) + (lastSession.distractionTime || 0);
        const focusPercentage = (totalTracked > 0) ? Math.round(((lastSession.focusTime || 0) / totalTracked) * 100) : 0;
        const startTime = lastSession.startTime.toLocaleString();
        const endTime = lastSession.endTime.toLocaleString();
        let topAppData = 'N/A';
        if (lastSession.appUsage && lastSession.appUsage.size > 0) {
            const topApp = [...lastSession.appUsage.entries()].sort((a, b) => b[1] - a[1])[0];
            topAppData = `${topApp[0]} (${formatDuration(topApp[1])})`;
        }
        lastSummaryContext = `Last Session Summary (Started: ${startTime}, Ended: ${endTime}): Duration: ${duration}, Focus: ${focusTime}, Distraction: ${distractionTime}, Focus Percentage: ${focusPercentage}%, Top App: ${topAppData}.`;
    }

    return { currentStatusContext, lastSummaryContext };
}


// @desc    Handle incoming chat messages
// @route   POST /api/chat
// @access  Private
exports.handleChatMessage = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message content is required' });
    }

    console.log(`Processing chat message from user ${userId}: "${message}"`);

    let botResponse = "Sorry, I encountered an issue. Please try again."; // Default error response

    try {
        // --- Step 1: Fetch Context Data (Current & Last Session) ---
        console.log("Fetching context data for user:", userId);
        const currentSession = await Session.findOne({ userId, endTime: null }).sort({ startTime: -1 });
        const lastSession = await Session.findOne({ userId, endTime: { $ne: null } }).sort({ endTime: -1 });

        // --- Step 2: Format Context for the LLM ---
        const { currentStatusContext, lastSummaryContext } = formatContextForLLM(currentSession, lastSession);
        console.log("Formatted Context - Status:", currentStatusContext);
        console.log("Formatted Context - Summary:", lastSummaryContext);

        // --- Step 3: Construct the Comprehensive Prompt ---
        // Combine persona, context, and the user's message
        const comprehensivePrompt = `
${systemPrompt}

--- CONTEXT DATA (Use only if relevant to the user's request below) ---
${currentStatusContext}
${lastSummaryContext}
--- END CONTEXT DATA ---

--- USER REQUEST ---
${message}
--- END USER REQUEST ---

Based on the user's request above and the context data (if applicable), provide a helpful and conversational response. If the user asks about their current status, use the 'Current Session Status' data. If they ask about their last session, use the 'Last Session Summary' data. If they ask for a tip or a general question, answer that directly without necessarily referencing the context data unless it enhances the answer. Focus on directly addressing the user's request.
`;

        // --- Step 4: Single LLM Call ---
        console.log("Calling Groq API with comprehensive prompt...");
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                // You can structure this differently if preferred,
                // but including all info in the user message often works well.
                // { role: "system", content: systemPrompt }, // Optionally keep system separate
                { role: "user", content: comprehensivePrompt }
            ],
            model: "llama3-8b-8192", // Or a more capable model if needed
            temperature: 0.7,
            max_tokens: 300, // Increase slightly to allow for context usage
            stream: false,
        });

        const potentialResponse = chatCompletion.choices[0]?.message?.content;

        if (potentialResponse && potentialResponse.trim().length > 0) {
            botResponse = potentialResponse;
            console.log("Groq response received.");
        } else {
            console.log("Groq returned an empty or invalid response.");
            botResponse = "I received your message, but I couldn't generate a proper response right now.";
        }

    } catch (error) {
        console.error("Error during chat processing:", error);
        // Consider more specific error checking if needed (e.g., Groq API errors)
        if (error.response) {
            console.error("Groq API Error Response Data:", error.response.data);
        }
        botResponse = "Oops! Something went wrong while processing your message. Please try again.";
        // Optionally send 500 status on critical failure
        // return res.status(500).json({ response: botResponse });
    }

    // --- Send Response ---
    console.log(`Sending bot response (first 100 chars): "${botResponse.substring(0, 100)}..."`);
    res.status(200).json({ response: botResponse });
});

