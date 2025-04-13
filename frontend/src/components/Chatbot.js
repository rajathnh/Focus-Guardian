// src/components/Chatbot.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Basic styling (you can replace with your own CSS classes or styling solution)
const styles = {
    chatContainer: {
        border: '1px solid #ccc',
        borderRadius: '5px',
        padding: '10px',
        maxWidth: '400px', // Adjust as needed
        fontFamily: 'sans-serif',
    },
    messagesArea: {
        height: '300px', // Adjust as needed
        overflowY: 'auto',
        border: '1px solid #eee',
        marginBottom: '10px',
        padding: '5px',
    },
    messageBubbleUser: {
        textAlign: 'right',
        margin: '5px',
        padding: '8px',
        backgroundColor: '#dcf8c6', // Light green
        borderRadius: '10px',
        display: 'inline-block', // Wrap content
        float: 'right', // Align right
        clear: 'both', // Prevent overlap
    },
    messageBubbleBot: {
        textAlign: 'left',
        margin: '5px',
        padding: '8px',
        backgroundColor: '#f1f0f0', // Light gray
        borderRadius: '10px',
        display: 'inline-block', // Wrap content
        float: 'left', // Align left
        clear: 'both', // Prevent overlap
    },
    inputArea: {
        display: 'flex',
    },
    inputField: {
        flexGrow: 1,
        padding: '8px',
        border: '1px solid #ccc',
        borderRadius: '3px',
    },
    sendButton: {
        padding: '8px 15px',
        marginLeft: '5px',
        cursor: 'pointer',
        border: 'none',
        backgroundColor: '#007bff',
        color: 'white',
        borderRadius: '3px',
    }
};

function Chatbot() {
    const [messages, setMessages] = useState([]); // Stores chat history: { sender: 'user'/'bot', text: '...' }
    const [inputText, setInputText] = useState(''); // Current text in the input field

    // --- CORRECT handleSendMessage Function ---
    // This function now correctly adds the user's message to the state
   // Function to handle sending a message
   const handleSendMessage = async () => { // Make function async
    if (!inputText.trim()) return; // Don't send empty messages

    const userMessage = {
        sender: 'user',
        text: inputText.trim()
    };

    // Add user message to the list IMMEDIATELY
    setMessages(prevMessages => [...prevMessages, userMessage]);

    const messageToSend = inputText.trim();
    setInputText(''); // Clear input field

    // --- Call Backend API ---
    try {
        console.log('Calling backend API: /api/chat with message:', messageToSend);

        // 1. Get token from localStorage
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) {
            // Handle missing token: display error or trigger logout
            const errorMessage = { sender: 'bot', text: "Error: You are not logged in." };
            setMessages(prevMessages => [...prevMessages, errorMessage]);
            return; // Stop processing if not authenticated
        }

        // 2. Prepare Headers
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Include the token
            }
        };

        // 3. Make POST request using axios
        const response = await axios.post(
            '/api/chat',               // Your backend endpoint
            { message: messageToSend }, // Data to send in the request body
            config                     // Configuration including headers
        );

        // 4. Process successful response from backend
        if (response.data && response.data.response) {
            const botMessage = {
                sender: 'bot',
                text: response.data.response // Get text from backend response
            };
            // Add bot's response to the messages list
            setMessages(prevMessages => [...prevMessages, botMessage]);
        } else {
            // Handle cases where response might be missing expected data
            console.error("Invalid response structure from server:", response.data);
            const errorMessage = { sender: 'bot', text: "Sorry, I received an unexpected response from the server." };
            setMessages(prevMessages => [...prevMessages, errorMessage]);
        }

    } catch (error) {
        // 5. Handle errors during the API call
        console.error("Error sending chat message:", error);
        let errorMessageText = 'Sorry, something went wrong.'; // Default error

        if (error.response) {
            // Server responded with a status code outside 2xx range
             console.error("Backend Error Data:", error.response.data);
             // Use backend error message if available, otherwise use status text
             errorMessageText = `Error: ${error.response.data?.message || error.response.statusText || 'Server error'}`;
             if (error.response.status === 401) { // Unauthorized
                errorMessageText = "Authentication error. Please log in again.";
                // Optionally trigger logout function from your app context/state management
             }
        } else if (error.request) {
            // Request was made but no response received (network error)
            console.error("Network Error:", error.request);
            errorMessageText = "Network error. Could not reach the server.";
        } else {
            // Something else happened in setting up the request
            console.error("Request Setup Error:", error.message);
            errorMessageText = `Error: ${error.message}`;
        }

        // Display the error message in the chat window
        const errorMessage = {
            sender: 'bot', // Show error as if it's from the bot
            text: errorMessageText
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
    }
    // --- End of API Call Logic ---
};
    // --- End of CORRECT handleSendMessage ---

    // Handle Enter key press in input field
    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    };

    return (
        <div style={styles.chatContainer}>
            <div style={styles.messagesArea}>
                {messages.map((msg, index) => (
                    <div key={index} style={msg.sender === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}>
                        {msg.text}
                    </div>
                ))}
                {/* Add a reference or scroll logic here if needed to auto-scroll */}
            </div>
            <div style={styles.inputArea}>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    style={styles.inputField}
                    placeholder="Ask something..."
                />
                <button onClick={handleSendMessage} style={styles.sendButton}>
                    Send
                </button>
            </div>
        </div>
    );
}

export default Chatbot;