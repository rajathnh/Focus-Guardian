// src/pages/ChatbotPage.jsx (or components/ChatbotPage.jsx)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

// Basic styling (consider moving to a CSS file or styled-components)
const styles = {
    pageContainer: {
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
        flexDirection: 'column', // Allows messages to stack
    },
    messageBubbleUser: {
        alignSelf: 'flex-end', // Align right
        margin: '5px 0',
        padding: '10px 15px',
        backgroundColor: '#dcf8c6', // Light green
        borderRadius: '15px 15px 0 15px', // Rounded corners
        maxWidth: '80%',
        wordWrap: 'break-word', // Ensure long words wrap
        whiteSpace: 'pre-wrap', // Preserve whitespace/newlines
    },
    messageBubbleBot: {
        alignSelf: 'flex-start', // Align left
        margin: '5px 0',
        padding: '10px 15px',
        backgroundColor: '#eeeeee', // Light gray
        borderRadius: '15px 15px 15px 0', // Rounded corners
        maxWidth: '80%',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
    },
    inputArea: {
        display: 'flex',
        alignItems: 'center', // Vertically align items
        marginTop: '10px',
    },
    inputField: {
        flexGrow: 1,
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '20px', // Rounded input field
        marginRight: '10px',
        fontSize: '1rem',
    },
    button: {
        padding: '10px 15px',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '50%', // Circular buttons
        backgroundColor: '#007bff',
        color: 'white',
        fontSize: '1.2rem', // Icon size
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px', // Fixed width
        height: '40px', // Fixed height
        marginLeft: '5px',
        transition: 'background-color 0.2s ease',
    },
    sendButton: {
        // Inherits from button, specific overrides if needed
    },
    recordButton: {
        // Inherits from button
        backgroundColor: '#6c757d', // Gray for record button
    },
    recordButtonRecording: {
        // Inherits from button
        backgroundColor: '#dc3545', // Red when recording
    },
    buttonDisabled: {
        backgroundColor: '#adb5bd',
        cursor: 'not-allowed',
    },
    statusArea: {
        textAlign: 'center',
        minHeight: '20px', // Reserve space for status
        fontSize: '0.9em',
        color: '#6c757d',
        marginTop: '5px',
    }
};

// --- Main Component ---
function ChatbotPage() {
    // State
    const [messages, setMessages] = useState([]); // { role: 'user'/'assistant', content: '...' }
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(true); // Start true for initial history load
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState(null); // Store general errors

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null); // Ref to auto-scroll target

    // --- Helper: Get Auth Token ---
    const getToken = useCallback(() => {
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) {
            setError("Authentication error: No token found. Please log in.");
            setIsLoading(false); // Stop loading if no token
        }
        return token;
    }, []);

    // --- Helper: Add Message to UI ---
    // Use useCallback to prevent unnecessary re-renders if passed as prop later
    const addMessage = useCallback((newMessage) => {
        // Backend uses 'assistant', frontend uses 'bot' for styling sometimes.
        // Let's align: Use 'user' and 'assistant' internally.
        const role = newMessage.sender === 'bot' ? 'assistant' : newMessage.sender;
        setMessages(prevMessages => [...prevMessages, { role, content: newMessage.text }]);
    }, []);

    // --- Effect: Fetch Initial Chat History ---
    useEffect(() => {
        const fetchHistory = async () => {
            setError(null); // Clear previous errors
            const token = getToken();
            if (!token) return; // Stop if no token

            console.log("Fetching chat history...");
            try {
                const config = {
                    headers: { 'Authorization': `Bearer ${token}` }
                };
                const response = await axios.get('/api/chat/history', config);

                if (response.data && Array.isArray(response.data.messages)) {
                     console.log(`Fetched ${response.data.messages.length} messages.`);
                     // Map backend structure {role, content} to {sender, text} if needed for consistency,
                     // but let's stick to {role, content} which matches backend/history model better.
                     setMessages(response.data.messages); // Assuming backend returns { role: 'user'/'assistant', content: '...' }
                } else {
                    setMessages([]); // Start empty if no history or invalid format
                }
            } catch (err) {
                console.error("Error fetching chat history:", err);
                setError(err.response?.data?.error || err.message || "Failed to load chat history.");
                setMessages([]); // Clear messages on error
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array means run once on mount

    // --- Effect: Auto-scroll to Bottom ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]); // Scroll whenever messages array changes

    // --- Handler: Send Text Message ---
    const handleSendMessage = useCallback(async () => {
        const messageText = inputText.trim();
        if (!messageText || isLoading || isRecording) return; // Prevent sending empty or while busy

        setError(null);
        const token = getToken();
        if (!token) return;

        const userMessage = { role: 'user', content: messageText };
        setMessages(prevMessages => [...prevMessages, userMessage]); // Add user message immediately
        setInputText(''); // Clear input field
        setIsLoading(true);

        console.log('Sending text message:', messageText);
        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };
            const response = await axios.post('/api/chat/converse', { message: messageText }, config);

            if (response.data && response.data.reply) {
                const botMessage = { role: 'assistant', content: response.data.reply };
                setMessages(prevMessages => [...prevMessages, botMessage]);
            } else {
                throw new Error("Invalid response structure from server.");
            }
        } catch (err) {
            console.error("Error sending text message:", err);
            const errorMessage = err.response?.data?.error || err.message || "Failed to send message.";
            setError(errorMessage); // Set general error state
            // Optionally add error message to chat:
            // const errorMsg = { role: 'assistant', content: `Error: ${errorMessage}` };
            // setMessages(prevMessages => [...prevMessages, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    }, [inputText, isLoading, isRecording, getToken]);

    // --- Handler: Start Audio Recording ---
    const handleStartRecording = useCallback(async () => {
        if (isRecording || isLoading) return;

        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = []; // Reset chunks
            // Use a common MIME type, check backend compatibility if needed
            const options = { mimeType: 'audio/webm;codecs=opus' };
            let recorder;
            try {
                recorder = new MediaRecorder(stream, options);
            } catch (e1) {
                 console.warn(`mimeType ${options.mimeType} not supported, trying default.`);
                 try {
                    recorder = new MediaRecorder(stream); // Try default
                 } catch (e2) {
                    console.error("MediaRecorder not supported:", e2);
                    setError("Audio recording is not supported by your browser.");
                    return;
                 }
            }
             mediaRecorderRef.current = recorder;


            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                console.log("Recording stopped, processing audio...");
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType || 'audio/webm' });
                audioChunksRef.current = []; // Clear chunks

                // Stop the tracks on the stream to turn off the mic indicator
                stream.getTracks().forEach(track => track.stop());

                // Send Blob to Backend
                const formData = new FormData();
                formData.append('audio', audioBlob, 'user_audio.webm'); // Key 'audio' must match multer backend

                const token = getToken();
                if (!token) {
                    setIsLoading(false);
                    return; // Stop if token became invalid
                }

                setIsLoading(true); // Start loading *before* API call
                try {
                    const config = {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                            'Authorization': `Bearer ${token}`
                        },
                    };
                    console.log("Sending audio data to backend...");
                    const response = await axios.post('/api/chat/converse/audio', formData, config);

                    if (response.data && response.data.reply) {
                        const botMessage = { role: 'assistant', content: response.data.reply };
                        setMessages(prevMessages => [...prevMessages, botMessage]);
                    } else {
                        throw new Error("Invalid response structure after audio upload.");
                    }
                } catch (err) {
                    console.error("Error sending audio:", err);
                    const errorMessage = err.response?.data?.error || err.message || "Failed to process audio.";
                    setError(errorMessage);
                } finally {
                    setIsLoading(false);
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            console.log("Recording started...");

        } catch (err) {
            console.error("Error accessing microphone:", err);
             if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                 setError("Microphone access denied. Please allow access in your browser settings.");
             } else {
                 setError("Could not start recording. Ensure microphone is connected and permissions are granted.");
             }
        }
    }, [isRecording, isLoading, getToken]);

    // --- Handler: Stop Audio Recording ---
    const handleStopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            // Processing and sending happens in the 'onstop' handler
            setIsRecording(false); // Update state immediately
            // Note: isLoading will be set true inside the onstop handler before API call
        }
    }, []);


    // --- Handler: Enter Key Press ---
    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !isLoading && !isRecording) {
            handleSendMessage();
        }
    };

    // --- Render ---
    return (
        <div style={styles.pageContainer}>
            <div style={styles.chatContainer}>
                {/* Messages Area */}
                <div style={styles.messagesArea}>
                    {isLoading && messages.length === 0 && <p>Loading history...</p>}
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            style={msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}
                        >
                            {msg.content}
                        </div>
                    ))}
                    {/* Invisible element to scroll to */}
                    <div ref={messagesEndRef} />
                </div>

                 {/* Status Area */}
                 <div style={styles.statusArea}>
                    {isRecording && "Recording audio..."}
                    {isLoading && !isRecording && "Waiting for response..."}
                    {error && <span style={{ color: 'red' }}>Error: {error}</span>}
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
                        disabled={isLoading || isRecording}
                    />
                    {/* Record Button */}
                    <button
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        style={{
                            ...styles.button,
                            ...(isRecording ? styles.recordButtonRecording : styles.recordButton),
                            ...(isLoading && !isRecording ? styles.buttonDisabled : {}) // Disable if loading but not recording
                        }}
                        disabled={isLoading && !isRecording} // Disable if loading but not recording
                        title={isRecording ? "Stop Recording" : "Record Audio"}
                    >
                        🎤 {/* Microphone Icon */}
                    </button>
                    {/* Send Button */}
                    <button
                        onClick={handleSendMessage}
                        style={{
                            ...styles.button,
                            ...styles.sendButton,
                            ...(isLoading || isRecording || !inputText.trim() ? styles.buttonDisabled : {})
                        }}
                        disabled={isLoading || isRecording || !inputText.trim()}
                        title="Send Message"
                    >
                        ➤ {/* Send Icon */}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ChatbotPage;