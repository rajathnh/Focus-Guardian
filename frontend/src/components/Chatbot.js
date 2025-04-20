// src/components/Chatbot.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
const API_URL = process.env.REACT_APP_API_BASE_URL;

// Basic styling (consider moving to a CSS file or styled-components)
const styles = {
  chatContainer: {
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '15px',
    width: '100%',
    maxWidth: '100%',          // Allow full width within its parent
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9f9f9',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  messagesArea: {
    flexGrow: 1,              // Takes available space
    height: '400px',          // Fixed height for the message area
    overflowY: 'auto',        // Enable vertical scrolling ONLY for this div
    border: '1px solid #e0e0e0',
    backgroundColor: '#ffffff',
    marginBottom: '10px',
    padding: '10px',
    borderRadius: '5px',
    display: 'flex',
    flexDirection: 'column', // Stack messages vertically
  },
  messageBubbleUser: {
    alignSelf: 'flex-end',     // Align user messages to the right
    margin: '5px 0',
    padding: '10px 15px',
    backgroundColor: '#dcf8c6', // Light green bubble
    borderRadius: '15px 15px 0 15px', // Rounded corners
    maxWidth: '80%',           // Limit message width
    wordWrap: 'break-word',    // Wrap long words
    whiteSpace: 'pre-wrap',    // Preserve line breaks
  },
  messageBubbleBot: {
    alignSelf: 'flex-start',   // Align bot messages to the left
    margin: '5px 0',
    padding: '10px 15px',
    backgroundColor: '#eeeeee', // Light grey bubble
    borderRadius: '15px 15px 15px 0', // Rounded corners
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
    flexGrow: 1,              // Input takes remaining space
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '20px',     // Rounded input field
    marginRight: '10px',
    fontSize: '1rem',
  },
  button: {
    padding: '10px 15px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '50%',       // Circular buttons
    backgroundColor: '#007bff', // Blue send button
    color: 'white',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',             // Fixed button size
    height: '40px',
    marginLeft: '5px',
    transition: 'background-color 0.2s ease',
    flexShrink: 0,             // Prevent buttons from shrinking
  },
  recordButton: {
    backgroundColor: '#6c757d', // Grey record button
  },
  recordButtonRecording: {
    backgroundColor: '#dc3545', // Red when recording
  },
  buttonDisabled: {
    backgroundColor: '#adb5bd', // Greyed out when disabled
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  statusArea: {
    textAlign: 'center',
    minHeight: '20px',         // Reserve space for status messages
    fontSize: '0.9em',
    color: '#6c757d',
    marginTop: '5px',
  }
};


function Chatbot() {
  // State variables
  const [messages, setMessages] = useState([]); // Stores chat messages { role: 'user'/'assistant', content: '...' }
  const [inputText, setInputText] = useState(''); // Current text in the input field
  const [isLoading, setIsLoading] = useState(true); // Tracks loading state (history fetch, message send)
  const [isRecording, setIsRecording] = useState(false); // Tracks audio recording state
  const [error, setError] = useState(null); // Stores any error messages

  // Refs
  const mediaRecorderRef = useRef(null); // Holds the MediaRecorder instance
  const audioChunksRef = useRef([]); // Stores audio data chunks during recording
  const messagesContainerRef = useRef(null); // Ref for the scrollable messages area

  // Helper function to get the auth token from local storage
  const getToken = useCallback(() => {
    try {
      const token = localStorage.getItem('focusGuardianToken');
      if (!token) {
        // Set error if token is missing, prevents further actions
        setError("Authentication error: Please log in again.");
        setIsLoading(false); // Ensure loading state is false if we error out early
        return null;
      }
      return token;
    } catch (err) {
      // Handle potential errors accessing local storage (e.g., security settings)
      console.error("Error accessing local storage:", err);
      setError("Error accessing local storage. Check browser settings.");
      setIsLoading(false);
      return null;
    }
  }, []); // Empty dependency array as it doesn't depend on component state/props

  // Effect to fetch chat history on initial component mount
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component
    const fetchHistory = async () => {
      setError(null); // Clear previous errors
      setIsLoading(true);
      const token = getToken();
      if (!token) {
        if (isMounted) setIsLoading(false); // Stop loading if no token
        return;
      }

      try {
        const res = await axios.get(`${API_URL}/api/chat/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Update messages state only if the component is still mounted and response is valid
        if (isMounted && Array.isArray(res.data.messages)) {
          // Filter out potentially malformed messages just in case
          setMessages(res.data.messages.filter(m => m && m.role && m.content));
        } else if (isMounted) {
          // If response is not an array, set messages to empty array
          setMessages([]);
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
        if (isMounted) {
          // Set error message based on API response or generic message
          setError(err.response?.data?.error || err.message || "Failed to load chat history.");
          setMessages([]); // Clear messages on error
        }
      } finally {
        // Ensure loading state is set to false regardless of success or failure
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    // Cleanup function: set isMounted to false when component unmounts
    return () => { isMounted = false; };
  }, [getToken]); // Re-run if getToken function instance changes (shouldn't, but good practice)

  // Effect for auto-scrolling the messages area to the bottom when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Set the scrollTop position to the total scroll height minus the visible client height
      // This reliably scrolls to the very bottom of the container
      container.scrollTop = container.scrollHeight - container.clientHeight;
    }
  }, [messages]); // Dependency: run this effect whenever the 'messages' array changes

  // Callback function to handle sending a text message
  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    // Prevent sending empty messages or sending while loading/recording
    if (!text || isLoading || isRecording) return;

    setError(null); // Clear previous errors
    const token = getToken();
    if (!token) return; // Stop if no token

    // Optimistically add the user's message to the state
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInputText(''); // Clear the input field
    setIsLoading(true); // Set loading state while waiting for the bot's response

    try {
      const res = await axios.post(
        `${API_URL}/api/chat/converse`,
        { message: text }, // Send message text in the request body
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        }
      );
      // Add the bot's reply to the messages state if it exists
      if (res.data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      } else {
        // Handle cases where the response structure is unexpected
        throw new Error("Invalid response structure from server.");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err.response?.data?.error || err.message || "Failed to send message.");
      // Optionally: remove the optimistically added user message on failure
      // setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false); // Clear loading state
    }
  }, [inputText, isLoading, isRecording, getToken]); // Dependencies for the callback

  // Callback function to start audio recording
  const handleStartRecording = useCallback(async () => {
    // Prevent starting if already recording or if chatbot is busy
    if (isRecording || isLoading) return;
    setError(null); // Clear previous errors

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = []; // Reset audio chunks array

      // Create MediaRecorder instance, trying specific mimeType first for better compatibility/quality
      let recorder;
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      try {
        recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      } catch (e) {
         console.warn("MediaRecorder creation failed, trying default:", e);
         recorder = new MediaRecorder(stream); // Fallback to default
      }

      mediaRecorderRef.current = recorder;

      // Event handler for when audio data is available
      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      // Event handler for when recording stops
      recorder.onstop = async () => {
        // Combine recorded chunks into a single Blob
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = []; // Clear chunks
        stream.getTracks().forEach(t => t.stop()); // Stop the microphone stream tracks

        const token = getToken();
        if (!token) {
          setIsLoading(false);
          return; // Stop if token is missing
        }

        // Prepare FormData to send the audio blob
        const formData = new FormData();
        // Ensure a filename is provided, which some backends might require
        formData.append('audio', blob, `recording.${recorder.mimeType?.split('/')[1]?.split(';')[0] || 'webm'}`);

        setIsLoading(true); // Set loading state while processing audio

        try {
          // Post audio data to the backend
          const res = await axios.post(
            `${API_URL}/api/chat/converse/audio`,
            formData,
            {
              headers: {
                // Content-Type is set automatically by browser for FormData
                Authorization: `Bearer ${token}`
              }
            }
          );

          // Process the response: add transcribed text (if useful) and bot reply
          const toAdd = [];
          const transcribed = res.data.transcribedText;
          // Avoid adding placeholder transcriptions
          const placeholders = ["[Silent Recording]", "[Audio input unclear]"];
          if (transcribed && !placeholders.includes(transcribed)) {
            toAdd.push({ role: 'user', content: transcribed });
          }
          if (res.data.reply) {
            toAdd.push({ role: 'assistant', content: res.data.reply });
          }
          // Update messages state if there's anything to add
          if (toAdd.length) {
             setMessages(prev => [...prev, ...toAdd]);
          } else if (!transcribed && !res.data.reply) {
             // Provide feedback if nothing was processed
             setError("Audio processed, but no text or reply generated.");
          }
        } catch (err) {
          console.error("Failed to process audio:", err);
          setError(err.response?.data?.error || err.message || "Failed to process audio.");
        } finally {
          setIsLoading(false); // Clear loading state
        }
      };

      // Start recording
      recorder.start();
      setIsRecording(true); // Update recording state

    } catch (err) {
      console.error("Could not start recording:", err);
      // Provide user-friendly error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No microphone found. Please ensure a microphone is connected and enabled.");
      } else {
        setError(`Could not start recording: ${err.message}`);
      }
    }
  }, [isRecording, isLoading, getToken]); // Dependencies for the callback

  // Callback function to stop audio recording
  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop(); // Triggers the 'onstop' event handler defined in handleStartRecording
      setIsRecording(false); // Update recording state
    }
  }, []); // No dependencies needed

  // Event handler to allow sending message by pressing Enter key
  const handleKeyPress = e => {
    if (e.key === 'Enter' && inputText.trim() && !isLoading && !isRecording) {
      e.preventDefault(); // Prevent default form submission/newline behavior
      handleSendMessage();
    }
  };

  // JSX Rendering
  return (
    <div style={styles.chatContainer}>
      {/* Messages display area */}
      <div style={styles.messagesArea} ref={messagesContainerRef}>
        {/* Show loading indicator only when history is loading initially */}
        {isLoading && messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888' }}>Loading chat history...</p>
        )}
        {/* Map through messages and render bubbles */}
        {messages.map((msg, idx) => (
          <div
            key={idx} // Using index as key is okay if messages aren't reordered/deleted often
            style={msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}
          >
            {msg.content}
          </div>
        ))}
        {/* The ref is now on the container itself, no need for an empty div at the end */}
      </div>

      {/* Status area for displaying recording/loading/error messages */}
      <div style={styles.statusArea}>
        {isRecording && "Recording audio..."}
        {/* Show thinking only when sending/processing, not during initial history load */}
        {isLoading && !isRecording && messages.length > 0 && "Assistant is thinking..."}
        {/* Display error message if any */}
        {error && <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Error: {error}</span>}
      </div>

      {/* Input area with text field and buttons */}
      <div style={styles.inputArea}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyPress={handleKeyPress} // Handle Enter key press
          style={styles.inputField}
          placeholder="Ask something or record audio..."
          disabled={isLoading || isRecording} // Disable input when loading or recording
          aria-label="Chat input"
        />
        {/* Record/Stop Button */}
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          style={{
            ...styles.button,
            ...(isRecording ? styles.recordButtonRecording : styles.recordButton), // Dynamic style for recording state
            ...(isLoading && !isRecording ? styles.buttonDisabled : {}) // Disable visually if loading (but not recording)
          }}
          disabled={isLoading && !isRecording} // Disable functionality if loading (but not recording)
          title={isRecording ? "Stop Recording" : "Start Recording Audio"}
          aria-label={isRecording ? "Stop Recording" : "Start Recording Audio"}
        >
          🎤 {/* Microphone icon */}
        </button>
        {/* Send Button */}
        <button
          onClick={handleSendMessage}
          style={{
            ...styles.button,
            // Disable visually if loading, recording, or input is empty
            ...(isLoading || isRecording || !inputText.trim() ? styles.buttonDisabled : {})
          }}
          // Disable functionality if loading, recording, or input is empty
          disabled={isLoading || isRecording || !inputText.trim()}
          title="Send Message"
          aria-label="Send Message"
        >
          ➤ {/* Send icon */}
        </button>
      </div>
    </div>
  );
}

export default Chatbot;