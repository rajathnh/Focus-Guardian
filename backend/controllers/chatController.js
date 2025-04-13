// controllers/chatController.js

const asyncHandler = require('express-async-handler');
const Groq = require('groq-sdk');
const Session = require('../models/Session');
const User = require('../models/User');

// Initialize Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Define the Chatbot Persona ---
// We define this once to reuse it easily.
const systemPrompt = `You are FocusBot, a productivity assistant integrated into a focus tracking application. Your goal is to help users understand their work patterns, and provide helpful tips or answer general questions. Keep your tone positive, and conversational, like a helpful colleague or coach. Speak directly to the user using "you". Keep responses concise unless asked for detail.`;

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

    let botResponse = "Sorry, I'm having trouble understanding that right now.";
    const lowerCaseMessage = message.toLowerCase();

    // --- Intent Detection and Handling ---

    // 1. Intent: Check Current Status (Less AI-dependent, focus on clarity)
    if (lowerCaseMessage.includes('status') || lowerCaseMessage.includes('how am i doing') || lowerCaseMessage.includes('current focus')) {
        console.log("Intent detected: Get Current Status");
        const currentSession = await Session.findOne({ userId, endTime: null }).sort({ startTime: -1 });

        if (currentSession) {
            const focusTime = currentSession.focusTime || 0;
            const distractionTime = currentSession.distractionTime || 0;
            const totalTime = focusTime + distractionTime;
            const focusPercentage = (totalTime > 0)
                ? Math.round((focusTime / totalTime) * 100)
                : 0;

            // Make this response a bit friendlier directly
            botResponse = `Okay, checking your current session (started at ${currentSession.startTime.toLocaleTimeString()}):
- Focus Time: ${formatDuration(focusTime)}
- Distraction Time: ${formatDuration(distractionTime)}
- Overall Focus: ${focusPercentage}% so far.`; // Added encouragement

            if (currentSession.appUsage && currentSession.appUsage.size > 0) {
                const sortedApps = [...currentSession.appUsage.entries()].sort((a, b) => b[1] - a[1]);
                const topApp = sortedApps[0];
                botResponse += `\n- Looks like **${topApp[0]}** is getting most of your attention (${formatDuration(topApp[1])}).`; // Friendlier phrasing
            } else {
                botResponse += `\n- App usage tracking hasn't recorded specific apps yet.`;
            }
        } else {
            botResponse = "It seems you don't have an active session running right now. Start one to track your focus!";
        }

    // 2. Intent: Summarize Last Session (Use AI with better prompt)
    } else if (lowerCaseMessage.includes('summarize') || lowerCaseMessage.includes('last session') || lowerCaseMessage.includes('summary')) {
        console.log("Intent detected: Summarize Last Session");
        const lastSession = await Session.findOne({ userId, endTime: { $ne: null } }).sort({ endTime: -1 });

        if (lastSession) {
            const durationSeconds = Math.round((lastSession.endTime - lastSession.startTime) / 1000);
            const focusTime = lastSession.focusTime || 0;
            const distractionTime = lastSession.distractionTime || 0;
            const totalTime = focusTime + distractionTime;
            const focusPercentage = (totalTime > 0)
                ? Math.round((focusTime / totalTime) * 100)
                : 0;
            const formattedStartTime = lastSession.startTime.toLocaleString();
            const formattedEndTime = lastSession.endTime.toLocaleString();

            let topAppData = 'N/A';
            if (lastSession.appUsage && lastSession.appUsage.size > 0) {
                const sortedApps = [...lastSession.appUsage.entries()].sort((a, b) => b[1] - a[1]);
                const topApp = sortedApps[0];
                topAppData = `${topApp[0]} (${formatDuration(topApp[1])})`;
            }
            const dataSummary = `Session Started: ${formattedStartTime}, Session Ended: ${formattedEndTime}, Duration: ${formatDuration(durationSeconds)}, Focus Time: ${formatDuration(focusTime)}, Distraction Time: ${formatDuration(distractionTime)}, Focus Percentage: ${focusPercentage}%, Top App Used: ${topAppData}.`;
            // --- Refined Prompt ---
            const userPromptForSummary = `Here's the data from your last focus session (including start/end times): ${dataSummary}. Give a brief summary of how it went. Don't drag it. You can optionally mention the time frame if it feels natural and adds value. Highlight the facts and give them details.`

            try {
                console.log("Calling Groq API for enhanced summary...");
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt }, // Add the system prompt
                        { role: "user", content: userPromptForSummary } // Use the refined user prompt
                    ],
                    model: "llama3-8b-8192",
                    temperature: 0.7, // Can adjust slightly, 0.7 is often good for conversational
                    max_tokens: 150,
                    stream: false,
                });
                botResponse = chatCompletion.choices[0]?.message?.content || `Okay, here's the raw summary: ${dataSummary}`; // More natural fallback text
                console.log("Groq enhanced summary received.");
            } catch (err) {
                console.error("Groq summary API error:", err);
                botResponse = `I had trouble generating a neat summary, but here's the data: ${dataSummary}`; // Friendlier error fallback
            }
        } else {
            botResponse = "I couldn't find any completed sessions in your history to summarize.";
        }

    // 3. Intent: Get Productivity Tip (Use AI with better prompt)
    } else if (lowerCaseMessage.includes('tip') || lowerCaseMessage.includes('advice')) {
        console.log("Intent detected: Get Productivity Tip");
        // --- Refined Prompt ---
        const userPromptForTip = "Can you give me a quick (1-2 sentences), actionable productivity tip? Make it sound encouraging and easy to try out.";

        try {
            console.log("Calling Groq API for enhanced tip...");
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt }, // Add the system prompt
                    { role: "user", content: userPromptForTip }   // Use the refined user prompt
                ],
                model: "llama3-8b-8192",
                temperature: 0.75, // Slightly higher temp might yield more varied/creative tips
                max_tokens: 100,
                stream: false,
            });
            botResponse = chatCompletion.choices[0]?.message?.content || "Quick tip: Try the Pomodoro Technique! Work focused for 25 minutes, then take a 5-minute break. It really helps!"; // More natural fallback
            console.log("Groq enhanced tip received.");
        } catch (err) {
            console.error("Groq tip API error:", err);
            botResponse = "Quick tip: Try the Pomodoro Technique! Work focused for 25 minutes, then take a 5-minute break. It really helps!"; // More natural error fallback
        }

    // 4. Intent: Handle General Questions (Use AI with system prompt)
    } else {
        console.log("No specific intent detected. Treating as general query.");

        try {
            console.log("Calling Groq API for general question...");
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt }, // Add the system prompt!
                    { role: "user", content: message } // Use the original user message
                ],
                model: "llama3-8b-8192",
                temperature: 0.7,
                max_tokens: 250,
                stream: false,
            });

            const potentialResponse = chatCompletion.choices[0]?.message?.content;
            if (potentialResponse && potentialResponse.trim().length > 0) {
                botResponse = potentialResponse;
                console.log("Groq general response received.");
            } else {
                console.log("Groq returned an empty response for general query.");
                // Use the persona even in fallback
                botResponse = "Hmm, I received your message, but I'm drawing a blank on that one right now. Could you try asking differently?";
            }

        } catch (err) {
            console.error("Groq general query API error:", err);
            botResponse = "Oops! I seem to be having a little trouble connecting right now. Please try asking again in a moment."; // Friendlier error
        }
    }
    // --- End of Intent Handling ---

    console.log(`Sending bot response: "${botResponse.substring(0, 100)}..."`);
    res.status(200).json({ response: botResponse });
});

// --- Helper Function (Keep as is) ---
function formatDuration(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0; // Handle potential negative values if needed
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) {
       return `${minutes}m`; // Cleaner for exact minutes
    }
    return `${minutes}m ${seconds}s`;
}


// module.exports = { handleChatMessage }; 