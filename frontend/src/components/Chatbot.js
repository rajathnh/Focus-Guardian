// src/components/Chatbot.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import styles from './Chatbot.module.css';
// import { createParser } from 'eventsource-parser';
const API_URL = process.env.REACT_APP_API_BASE_URL;

// Basic styling (consider moving to a CSS file or styled-components)

const fallbackBgColor = '#ffffff'; 
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
  const streamAbortControllerRef = useRef(null); // Ref for the AbortController

  
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

   // Effect to abort stream on component unmount
   useEffect(() => {
    // This function runs when the component is about to unmount
    return () => {
      if (streamAbortControllerRef.current) {
        console.log("Chatbot unmounting, aborting any active stream.");
        // If there's an active AbortController (meaning a stream might be running), call its abort() method.
        streamAbortControllerRef.current.abort();
      }
    };
  }, []); 

// Callback function to handle sending a text message (Streaming Version - MANUAL PARSING)
// src/components/Chatbot.js (handleSendMessage - Buffer and Clean Strategy)

const handleSendMessage = useCallback(async () => {
  const text = inputText.trim();
  if (!text || isLoading || isRecording) return;

  setError(null);
  const token = getToken();
  if (!token) return;

  // --- Stream Handling Setup ---
  if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      console.log("New message sent, aborting previous stream.");
  }
  const abortController = new AbortController();
  streamAbortControllerRef.current = abortController;

  // --- Optimistic UI Updates ---
  const userMessage = { role: 'user', content: text };
  const botMessageId = `bot-${Date.now()}-${Math.random()}`;
  const botMessagePlaceholder = {
      role: 'assistant',
      content: '', // Start empty
      id: botMessageId
  };
  setMessages(prev => [...prev, userMessage, botMessagePlaceholder]);
  setInputText('');
  setIsLoading(true);

  // --- Fetch and Process Stream ---
  // Use a variable outside the loop to accumulate RAW text
  let rawAccumulatedResponse = '';

  try {
      const response = await fetch(`${API_URL}/api/chat/converse/stream`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'Accept': 'text/event-stream',
          },
          body: JSON.stringify({ message: text }),
          signal: abortController.signal,
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }
      if (!response.body) {
          throw new Error("Streaming response body is missing.");
      }

      // --- MANUAL SSE PARSING ---
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      console.log("Starting stream reader loop (Manual Parsing)...");
      while (true) {
          const { value, done } = await reader.read();
          if (done) {
              console.log("Stream reader finished (done is true).");
              break;
          }

          const decodedChunk = decoder.decode(value, { stream: true });
          buffer += decodedChunk;

          // Process complete messages in the buffer
          let boundaryIndex;
          while ((boundaryIndex = buffer.indexOf('\n\n')) >= 0) {
              const message = buffer.substring(0, boundaryIndex).trim();
              buffer = buffer.substring(boundaryIndex + 2);

              // --- Event Handling ---
              if (message.startsWith('event: end')) {
                  console.log("ManualParse: Detected 'event: end'. Stopping.");
                  setIsLoading(false);
                  if (streamAbortControllerRef.current && !streamAbortControllerRef.current.signal.aborted) streamAbortControllerRef.current = null;
                  // Final state update based on the LAST cleaned version of the accumulated raw response
                  const finalCleanedContent = rawAccumulatedResponse.replace(/<think>.*?<\/think>\s*/gs, '').trim();
                  setMessages(prev => prev.map(msg =>
                    msg.id === botMessageId ? { ...msg, content: finalCleanedContent } : msg
                  ));
                  continue;
              }
              if (message.startsWith('event: error')) {
                 console.error("ManualParse: Detected 'event: error'.");
                 // ... (error handling remains the same, update placeholder with error) ...
                 setIsLoading(false);
                 if (streamAbortControllerRef.current && !streamAbortControllerRef.current.signal.aborted) streamAbortControllerRef.current = null;
                 setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, content: `[Error processing...]` } : msg)); // Simplified
                 continue;
              }

              // --- Data Processing ---
              if (message.startsWith('data:')) {
                  const dataContent = message.substring(5).trim();
                  try {
                      const json = JSON.parse(dataContent);
                      if (json.chunk) {
                          const rawChunk = json.chunk;

                          // **** ACCUMULATE RAW, CLEAN ENTIRE BUFFER ****
                          rawAccumulatedResponse += rawChunk; // Append raw chunk to the total raw response

                          // Clean the *entire* accumulated raw response *every time* a chunk arrives
                          const currentCleanedContent = rawAccumulatedResponse.replace(/<think>.*?<\/think>\s*/gs, '').trim();
                          // **** END CLEANING LOGIC ****

                          // Log difference for debugging
                          // if (currentCleanedContent !== rawAccumulatedResponse) {
                          //      console.log(`Cleaning removed tags. Raw length: ${rawAccumulatedResponse.length}, Cleaned length: ${currentCleanedContent.length}`);
                          // }

                          // Update the state with the LATEST fully cleaned content
                          // React's reconciliation should handle updating the display efficiently
                          setMessages(prevMessages => prevMessages.map(msg => {
                              if (msg.id === botMessageId) {
                                  return { ...msg, content: currentCleanedContent }; // Set content to the latest cleaned full string
                              }
                              return msg;
                          }));

                      } else {
                          console.warn("ManualParse: Received data message without 'chunk' property:", json);
                      }
                  } catch (e) {
                      console.error("ManualParse: Error parsing data JSON:", e, "Raw Data:", dataContent);
                  }
              } else if (message) {
                  // console.log("ManualParse: Received non-data/non-event line:", message);
              }
          } // End while buffer processing
      } // End while reader.read()
      console.log("Exited stream reader loop (Manual Parsing).");

      // --- Fallback Cleanup ---
       if (isLoading) {
          console.warn("ManualParse: Stream loop finished weirdly (isLoading still true). Forcing loading stop & final clean.");
          setIsLoading(false);
          if (streamAbortControllerRef.current && !streamAbortControllerRef.current.signal.aborted) streamAbortControllerRef.current = null;
          // Apply final cleaning to whatever was accumulated raw
          const finalCleanedContent = rawAccumulatedResponse.replace(/<think>.*?<\/think>\s*/gsi, '').trim();
          setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, content: finalCleanedContent } : msg));
      }

  } catch (err) {
      // --- Error Handling ---
       if (err.name === 'AbortError') {
          console.log("Fetch request was aborted by AbortController.");
          setMessages(prev => prev.filter(msg => msg.id !== botMessageId));
      } else {
          console.error("Failed to send message or process stream:", err);
          const errorText = err.message || "Failed to get response from assistant.";
          setError(errorText);
          setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, content: `[Error: ${errorText}]` } : msg ));
      }
      setIsLoading(false);
       if (streamAbortControllerRef.current && !streamAbortControllerRef.current.signal.aborted) streamAbortControllerRef.current = null;
  }

}, [inputText, isLoading, isRecording, getToken]); // Dependencies
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

  return (
    // Use className for the main container
    <div className={styles.chatContainer}>

      {/* Use className for the messages area */}
      <div className={styles.messagesArea} ref={messagesContainerRef} style={{
          // Use the PUBLIC_URL environment variable provided by CRA/similar build tools
          backgroundImage: ``,

          // Explicitly set other background properties here too
          backgroundColor: fallbackBgColor, // Fallback color
          backgroundSize: 'auto',         // Or 'cover', 'contain', etc.
          backgroundRepeat: 'repeat',     // Repeat the pattern
          backgroundAttachment: 'local',  // Scroll with content
        }}>

        {/* Keep inline style for loading text as it doesn't use 'styles' object */}
        {isLoading && messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888' }}>Loading chat history...</p>
        )}

        {/* Map through messages */}
        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx} // Prefer unique ID if available
            // Use className and combine classes conditionally
            className={`
              ${styles.messageBubbleBase || ''} {/* Optional: Add a base class for common bubble styles */}
              ${msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}
            `}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Use className for the status area */}
      <div className={styles.statusArea}>
        {isRecording && "Recording audio..."}
        {isLoading && !isRecording && messages.length > 0 && "Assistant is thinking..."}
        {/* Keep inline style for error text as it doesn't use 'styles' object */}
        {error && <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Error: {error}</span>}
      </div>

      {/* Use className for the input area */}
      <div className={styles.inputArea}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          // Use className for the input field
          className={styles.inputField}
          placeholder="Ask something or record audio..."
          disabled={isLoading || isRecording}
          aria-label="Chat input"
        />

        {/* Record/Stop Button - Use className and combine conditional classes */}
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          // Combine class names using template literals
          className={`
            ${styles.button}
            ${isRecording ? styles.recordButtonRecording : styles.recordButton}
            ${(isLoading && !isRecording) ? styles.buttonDisabled : ''}
          `}
          disabled={isLoading && !isRecording}
          title={isRecording ? "Stop Recording" : "Start Recording Audio"}
          aria-label={isRecording ? "Stop Recording" : "Start Recording Audio"}
        >
          🎤 {/* Keep original emoji */}
        </button>

        {/* Send Button - Use className and combine conditional classes */}
        <button
          onClick={handleSendMessage}
          // Combine class names using template literals
          className={`
            ${styles.button} ${styles.sendButton || ''} {/* Added optional sendButton class */}
            ${(isLoading || isRecording || !inputText.trim()) ? styles.buttonDisabled : ''}
          `}
          disabled={isLoading || isRecording || !inputText.trim()}
          title="Send Message"
          aria-label="Send Message"
        >
          ➤ {/* Keep original emoji */}
        </button>
      </div>
    </div>
  );
}


export default Chatbot;