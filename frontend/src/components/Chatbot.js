// src/components/Chatbot.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
const API_URL = process.env.REACT_APP_API_BASE_URL;

// Basic styling (consider moving to a CSS file or styled-components)
const styles = {
    pageContainer: { // Assuming this component might fill a page section
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'sans-serif',
    },
    chatContainer: {
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '15px',
        width: '100%',
        maxWidth: '500px', // Adjust max width as needed
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f9f9f9',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)', // Added subtle shadow
    },
    messagesArea: {
        flexGrow: 1,
        height: '400px', // Adjust height
        overflowY: 'auto',
        border: '1px solid #e0e0e0',
        backgroundColor: '#ffffff',
        marginBottom: '10px',
        padding: '10px',
        borderRadius: '5px',
        display: 'flex',
        flexDirection: 'column',
    },
    messageBubbleUser: {
        alignSelf: 'flex-end',
        margin: '5px 0',
        padding: '10px 15px',
        backgroundColor: '#dcf8c6',
        borderRadius: '15px 15px 0 15px',
        maxWidth: '80%',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
    },
    messageBubbleBot: {
        alignSelf: 'flex-start',
        margin: '5px 0',
        padding: '10px 15px',
        backgroundColor: '#eeeeee',
        borderRadius: '15px 15px 15px 0',
        maxWidth: '80%',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
    },
    inputArea: {
        display: 'flex',
        alignItems: 'center',
        marginTop: '10px',
    },
    inputField: {
        flexGrow: 1,
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '20px',
        marginRight: '10px',
        fontSize: '1rem',
    },
    button: {
        padding: '10px 15px',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '50%',
        backgroundColor: '#007bff',
        color: 'white',
        fontSize: '1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        marginLeft: '5px',
        transition: 'background-color 0.2s ease',
        flexShrink: 0, // Prevent buttons from shrinking
    },
    sendButton: {},
    recordButton: {
        backgroundColor: '#6c757d',
    },
    recordButtonRecording: {
        backgroundColor: '#dc3545',
    },
    buttonDisabled: {
        backgroundColor: '#adb5bd',
        cursor: 'not-allowed',
        opacity: 0.7,
    },
    statusArea: {
        textAlign: 'center',
        minHeight: '20px',
        fontSize: '0.9em',
        color: '#6c757d',
        marginTop: '5px',
    }
};

// --- Main Component ---
function Chatbot() {
    // State
    const [messages, setMessages] = useState([]); // Stores { role: 'user'/'assistant', content: '...' }
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(true); // For initial history load and API calls
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState(null); // Store user-facing errors

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null); // Ref for auto-scrolling

    // --- Helper: Get Auth Token ---
    const getToken = useCallback(() => {
        try {
            const token = localStorage.getItem('focusGuardianToken');
            if (!token) {
                console.error("Authentication token not found in localStorage.");
                setError("Authentication error: Please log in again.");
                setIsLoading(false);
                return null;
            }
            return token;
        } catch (e) {
             console.error("Error accessing localStorage:", e);
             setError("Error accessing local storage. Please check browser settings.");
             setIsLoading(false);
             return null;
        }
    }, []);

    // --- Effect: Fetch Initial Chat History ---
    useEffect(() => {
        let isMounted = true; // Flag to prevent state update on unmounted component
        const fetchHistory = async () => {
            setError(null);
            setIsLoading(true); // Ensure loading state is true
            const token = getToken();
            if (!token) {
                if (isMounted) setIsLoading(false); // Stop loading if no token early
                return;
            }

            console.log("Fetching chat history...");
            try {
                const config = {
                    headers: { 'Authorization': `Bearer ${token}` }
                };
                const response = await axios.get(`${API_URL}/api/chat/history`, config); // Use absolute path or configure baseURL

                if (isMounted) {
                    if (response.data && Array.isArray(response.data.messages)) {
                        console.log(`Fetched ${response.data.messages.length} messages.`);
                        // Ensure messages have role and content
                        const validMessages = response.data.messages.filter(m => m && m.role && m.content);
                        setMessages(validMessages);
                    } else {
                        console.log("No history found or invalid format.");
                        setMessages([]);
                    }
                }
            } catch (err) {
                console.error("Error fetching chat history:", err);
                if (isMounted) {
                    const errMsg = err.response?.data?.error || err.message || "Failed to load chat history.";
                     if (err.response?.status === 401) {
                         setError("Authentication error loading history. Please log in again.");
                     } else {
                         setError(errMsg);
                     }
                    setMessages([]);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchHistory();

        return () => {
            isMounted = false; // Cleanup function to set flag on unmount
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Depend on getToken if it might change, but likely just needs mount

    // --- Effect: Auto-scroll to Bottom ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- Handler: Send Text Message ---
    const handleSendMessage = useCallback(async () => {
        const messageText = inputText.trim();
        if (!messageText || isLoading || isRecording) return;

        setError(null);
        const token = getToken();
        if (!token) return;

        const userMessage = { role: 'user', content: messageText };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        setInputText('');
        setIsLoading(true);

        console.log('Sending text message:', messageText);
        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };
            // Use absolute path or ensure axios baseURL is configured
            const response = await axios.post(`${API_URL}/api/chat/converse`, { message: messageText }, config);

            if (response.data && response.data.reply) {
                const botMessage = { role: 'assistant', content: response.data.reply };
                setMessages(prevMessages => [...prevMessages, botMessage]);
            } else {
                console.error("Invalid response structure from server:", response.data);
                throw new Error("Invalid response structure from server.");
            }
        } catch (err) {
            console.error("Error sending text message:", err);
            const errorMessage = err.response?.data?.error || err.message || "Failed to send message.";
            if (err.response?.status === 401) {
                 setError("Authentication error. Please log in again.");
             } else {
                 setError(errorMessage);
             }
            // Remove the optimistic user message on error? Optional.
            // setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsLoading(false);
        }
    }, [inputText, isLoading, isRecording, getToken]); // Include getToken if needed

    // --- Handler: Start Audio Recording ---
    const handleStartRecording = useCallback(async () => {
        if (isRecording || isLoading) return;
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];
            const options = { mimeType: 'audio/webm;codecs=opus' }; // Prefer opus if available
            let recorder;
            try { recorder = new MediaRecorder(stream, options); }
            catch (e1) {
                console.warn(`mimeType ${options.mimeType} not supported, trying default.`);
                try { recorder = new MediaRecorder(stream); }
                catch (e2) { console.error("MediaRecorder not supported:", e2); setError("Audio recording is not supported by your browser."); return; }
            }
            mediaRecorderRef.current = recorder;

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) { audioChunksRef.current.push(event.data); }
            };

            // --- **** UPDATED onstop handler **** ---
            mediaRecorderRef.current.onstop = async () => {
                console.log("Recording stopped, processing audio...");
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType || 'audio/webm' });
                audioChunksRef.current = [];
                stream.getTracks().forEach(track => track.stop()); // Release microphone

                const formData = new FormData();
                formData.append('audio', audioBlob, 'user_audio.webm'); // Filename hint helps server sometimes

                const token = getToken();
                if (!token) { setIsLoading(false); return; }

                setIsLoading(true); // Show loading state
                try {
                    const config = {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                            'Authorization': `Bearer ${token}`
                        },
                    };
                    console.log("Sending audio data to backend...");
                    // Use absolute path or ensure axios baseURL is configured
                    const response = await axios.post(`${API_URL}/api/chat/converse/audio`, formData, config);

                    // --- Add BOTH user's transcribed text and bot's reply ---
                    const newMessagesToAdd = [];
                    if (response.data) {
                        // Check if user "said" something meaningful (check against backend placeholders)
                        const transcribed = response.data.transcribedText;
                        const backendPlaceholders = ["[Silent Recording]", "[Audio input unclear]"];
                        if (transcribed && !backendPlaceholders.includes(transcribed)) {
                             newMessagesToAdd.push({ role: 'user', content: transcribed });
                             console.log("Adding user's transcribed message:", transcribed);
                        } else {
                             console.log("Transcription was empty or placeholder, not adding user message bubble.");
                             // Optionally add a visual cue like:
                             // newMessagesToAdd.push({ role: 'user', content: '🎤 [Audio Sent]' });
                        }
                        // Always add the bot's reply if it exists
                        if (response.data.reply) {
                             newMessagesToAdd.push({ role: 'assistant', content: response.data.reply });
                             console.log("Adding assistant's reply:", response.data.reply);
                        }
                    } else {
                         console.error("Empty response data received from server after audio upload.");
                         throw new Error("Empty response data received from server after audio upload.");
                    }

                    if (newMessagesToAdd.length > 0) {
                        setMessages(prevMessages => [...prevMessages, ...newMessagesToAdd]);
                    }
                    // ----------------------------------------------------------

                } catch (err) {
                    console.error("Error sending audio:", err);
                     const errorMessage = err.response?.data?.error || err.message || "Failed to process audio.";
                     if (err.response?.status === 401) {
                         setError("Authentication error. Please log in again.");
                     } else {
                         setError(errorMessage);
                     }
                } finally {
                    setIsLoading(false); // Stop loading indicator
                }
            };
            // --- **** END UPDATED onstop handler **** ---

            mediaRecorderRef.current.start();
            setIsRecording(true);
            console.log("Recording started...");

        } catch (err) {
            console.error("Error accessing microphone:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') { setError("Microphone access denied. Please allow access in your browser settings."); }
            else { setError("Could not start recording. Ensure microphone is connected and permissions are granted."); }
        }
    }, [isRecording, isLoading, getToken]); // Dependencies for useCallback

    // --- Handler: Stop Audio Recording ---
    const handleStopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop(); // Triggers the onstop handler above
            setIsRecording(false); // Update UI state immediately
        }
    }, []);

    // --- Handler: Enter Key Press ---
    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !isLoading && !isRecording && inputText.trim()) { // Also check if input is not empty
            handleSendMessage();
        }
    };

    // --- Render ---
    return (
        // Removed outer page container assuming this is just the component
        <div style={styles.chatContainer}>
            {/* Messages Area */}
            <div style={styles.messagesArea}>
                {/* Optional: Show loading indicator for history */}
                {isLoading && messages.length === 0 && <p style={{textAlign: 'center', color: '#888'}}>Loading history...</p>}
                {/* Render messages */}
                {messages.map((msg, index) => (
                    <div
                        key={index} // Using index is okay for chat if messages aren't reordered/deleted
                        style={msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}
                    >
                        {msg.content}
                    </div>
                ))}
                {/* Invisible element to scroll to */}
                <div ref={messagesEndRef} />
            </div>

             {/* Status Area: Shows errors or current action */}
             <div style={styles.statusArea}>
                {isRecording && "Recording audio..."}
                {isLoading && !isRecording && "Assistant is thinking..."} {/* Changed loading text */}
                {error && <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Error: {error}</span>} {/* Style error */}
             </div>

            {/* Input Area */}
            <div style={styles.inputArea}>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    style={styles.inputField}
                    placeholder="Ask something or record audio..."
                    disabled={isLoading || isRecording} // Disable input while loading or recording
                    aria-label="Chat input"
                />
                {/* Record Button */}
                <button
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    style={{
                        ...styles.button,
                        ...(isRecording ? styles.recordButtonRecording : styles.recordButton),
                        ...(isLoading && !isRecording ? styles.buttonDisabled : {})
                    }}
                    disabled={isLoading && !isRecording} // Prevent recording while bot is thinking
                    title={isRecording ? "Stop Recording" : "Record Audio"}
                    aria-label={isRecording ? "Stop Recording" : "Record Audio"}
                >
                    🎤
                </button>
                {/* Send Button */}
                <button
                    onClick={handleSendMessage}
                    style={{
                        ...styles.button,
                        ...styles.sendButton,
                        ...(isLoading || isRecording || !inputText.trim() ? styles.buttonDisabled : {}) // Disable if loading, recording, or empty input
                    }}
                    disabled={isLoading || isRecording || !inputText.trim()}
                    title="Send Message"
                    aria-label="Send Message"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}

export default Chatbot; // Changed export name to match file reference