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
    maxWidth: '100%',          // ← allow full width
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9f9f9',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  messagesArea: {
    flexGrow: 1,
    height: '400px',
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
    flexShrink: 0,
  },
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

function Chatbot() {
  // State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  // Auth token helper
  const getToken = useCallback(() => {
    try {
      const token = localStorage.getItem('focusGuardianToken');
      if (!token) {
        setError("Authentication error: Please log in again.");
        setIsLoading(false);
        return null;
      }
      return token;
    } catch {
      setError("Error accessing local storage.");
      setIsLoading(false);
      return null;
    }
  }, []);

  // Fetch chat history
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      setError(null);
      setIsLoading(true);
      const token = getToken();
      if (!token) {
        if (isMounted) setIsLoading(false);
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/api/chat/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (isMounted && Array.isArray(res.data.messages)) {
          setMessages(res.data.messages.filter(m => m && m.role && m.content));
        } else if (isMounted) {
          setMessages([]);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error || err.message || "Failed to load chat history.");
          setMessages([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [getToken]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send text message
  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading || isRecording) return;

    setError(null);
    const token = getToken();
    if (!token) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await axios.post(
        `${API_URL}/api/chat/converse`,
        { message: text },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (res.data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      } else {
        throw new Error("Invalid response structure");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to send message.");
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, isRecording, getToken]);

  // Audio recording start
  const handleStartRecording = useCallback(async () => {
    if (isRecording || isLoading) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        stream.getTracks().forEach(t => t.stop());

        const formData = new FormData();
        formData.append('audio', blob, 'user_audio.webm');
        const token = getToken();
        if (!token) {
          setIsLoading(false);
          return;
        }
        setIsLoading(true);
        try {
          const res = await axios.post(
            `${API_URL}/api/chat/converse/audio`,
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: `Bearer ${token}`
              }
            }
          );
          const toAdd = [];
          const transcribed = res.data.transcribedText;
          const placeholders = ["[Silent Recording]", "[Audio input unclear]"];
          if (transcribed && !placeholders.includes(transcribed)) {
            toAdd.push({ role: 'user', content: transcribed });
          }
          if (res.data.reply) {
            toAdd.push({ role: 'assistant', content: res.data.reply });
          }
          if (toAdd.length) setMessages(prev => [...prev, ...toAdd]);
        } catch (err) {
          setError(err.response?.data?.error || err.message || "Failed to process audio.");
        } finally {
          setIsLoading(false);
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(err.name.includes('NotAllowed') ? "Microphone access denied." : "Could not start recording.");
    }
  }, [isRecording, isLoading, getToken]);

  // Audio recording stop
  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // Enter key -> send
  const handleKeyPress = e => {
    if (e.key === 'Enter' && inputText.trim() && !isLoading && !isRecording) {
      handleSendMessage();
    }
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.messagesArea}>
        {isLoading && messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888' }}>Loading history...</p>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleBot}
          >
            {msg.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.statusArea}>
        {isRecording && "Recording audio..."}
        {isLoading && !isRecording && "Assistant is thinking..."}
        {error && <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Error: {error}</span>}
      </div>

      <div style={styles.inputArea}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          style={styles.inputField}
          placeholder="Ask something or record audio..."
          disabled={isLoading || isRecording}
          aria-label="Chat input"
        />
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          style={{
            ...styles.button,
            ...(isRecording ? styles.recordButtonRecording : styles.recordButton),
            ...(isLoading && !isRecording ? styles.buttonDisabled : {})
          }}
          disabled={isLoading && !isRecording}
          title={isRecording ? "Stop Recording" : "Record Audio"}
          aria-label={isRecording ? "Stop Recording" : "Record Audio"}
        >
          🎤
        </button>
        <button
          onClick={handleSendMessage}
          style={{
            ...styles.button,
            ...(isLoading || isRecording || !inputText.trim() ? styles.buttonDisabled : {})
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

export default Chatbot;
