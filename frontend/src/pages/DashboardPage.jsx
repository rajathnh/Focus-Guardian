// src/pages/DashboardPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'; // Keep useState
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chatbot from '../components/Chatbot';
import FocusDetector from '../components/FocusDetector';
import './dashboard.css';

// --- NO IMPORT FROM @mediapipe/face_mesh HERE ---

const API_URL = process.env.REACT_APP_API_BASE_URL || '';
const POLLING_INTERVAL_MS = 15000;

// Axios instance with token
const createAuthAxiosInstance = () => {
  const instance = axios.create({ baseURL: API_URL });
  const token = localStorage.getItem('focusGuardianToken');
  if (token) {
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete instance.defaults.headers.common['Authorization'];
  }
  return instance;
};
let authAxios = createAuthAxiosInstance();

export default function DashboardPage() {
  const navigate = useNavigate();

  // --- State ---
  const [user, setUser] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [latestFocusStatus, setLatestFocusStatus] = useState(null);
  const [latestScreenActivity, setLatestScreenActivity] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [authToken, setAuthToken] = useState(localStorage.getItem('focusGuardianToken'));

  // --- Refs ---
  const elapsedTimerIntervalRef = useRef(null);
  const pollingIntervalRef = useRef(null);

   // --- Utility Functions ---
   const stopPolling = useCallback(() => {
    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
   }, []);

  // --- Event Handlers & Side Effects ---

  // Logout Handler
  const handleLogout = useCallback(() => {
    console.log("DashboardPage: handleLogout called");
    setIsSessionRunning(false);
    clearInterval(elapsedTimerIntervalRef.current);
    stopPolling();
    // ... (reset other state: activeSessionId, sessionStartTime, etc.) ...
    setActiveSessionId(null); setSessionStartTime(null); setElapsedTime(0);
    setLatestFocusStatus(null); setLatestScreenActivity(null);
    localStorage.removeItem('focusGuardianToken'); localStorage.removeItem('focusGuardianUser');
    setUser(null); setAuthToken(null);
    authAxios = createAuthAxiosInstance();
    navigate('/login');
  }, [navigate, stopPolling]);

  // Fetch Latest Activity
  const fetchLatestActivity = useCallback(async (sessionId) => {
    if (!isSessionRunning || !sessionId || sessionId !== activeSessionId) {
         if (pollingIntervalRef.current && activeSessionId !== sessionId) { stopPolling(); }
         return;
    }
    try {
        authAxios = createAuthAxiosInstance();
        const res = await authAxios.get(`/api/sessions/${sessionId}/latest-activity`);
        if (activeSessionId === sessionId) {
             setLatestScreenActivity({ appName: res.data.appName, activity: res.data.activity });
        } else { stopPolling(); }
    } catch (error) {
        if (error.response?.status === 404) { stopPolling(); }
        else if (error.response?.status === 401) { handleLogout(); }
        else { console.error("[Polling] Error fetching latest activity:", error); }
    }
  }, [activeSessionId, isSessionRunning, handleLogout, stopPolling]);

  // Start Polling
  const startPolling = useCallback((sessionId) => {
    if (!sessionId || pollingIntervalRef.current) return;
    console.log(`[Polling] Starting polling for session ${sessionId}`);
    clearInterval(pollingIntervalRef.current);
    fetchLatestActivity(sessionId); // Fetch immediately
    pollingIntervalRef.current = setInterval(() => { fetchLatestActivity(sessionId); }, POLLING_INTERVAL_MS);
  }, [fetchLatestActivity]);

  // Stop Session Handler
  const handleStopSession = useCallback(async () => {
    if (!activeSessionId) return;
    console.log("DashboardPage: handleStopSession called");
    setError(null);
    setLoadingAction(true);
    setIsSessionRunning(false); // Trigger cleanup FIRST
    clearInterval(elapsedTimerIntervalRef.current);
    stopPolling();
    setLatestFocusStatus(null); setLatestScreenActivity(null);

    const currentSessionIdToStop = activeSessionId;
    setActiveSessionId(null); setSessionStartTime(null); setElapsedTime(0);

    try {
       authAxios = createAuthAxiosInstance();
      await authAxios.post(`/api/sessions/${currentSessionIdToStop}/stop`);
      console.log("Session stop command sent successfully.");
    } catch (err) {
       console.error("Failed to notify backend of session stop:", err);
      setError(`Stop error: ${err.response?.data?.message || err.message}`);
       if (err.response?.status === 401) { handleLogout(); }
    } finally { setLoadingAction(false); }
  }, [activeSessionId, handleLogout, stopPolling]);

  // Start Session Handler
  const handleStartSession = useCallback(async () => {
    // Added loadingAction check here
    if (isSessionRunning || activeSessionId || loadingAction) return;
    console.log("DashboardPage: handleStartSession called");
    setError(null); setLatestFocusStatus(null); setLatestScreenActivity(null);
    setElapsedTime(0); setLoadingAction(true);
    stopPolling();

    try {
       authAxios = createAuthAxiosInstance();
       if (!authToken) throw new Error("Authentication token missing.");
      const res = await authAxios.post(`/api/sessions/start`);
      if (!res.data.sessionId) throw new Error("No session ID returned");

      const newSessionId = res.data.sessionId;
      const startTimeString = res.data.startTime || new Date().toISOString();
      console.log("DashboardPage: Received start time:", startTimeString);

      setActiveSessionId(newSessionId); setSessionStartTime(startTimeString);
      setLatestScreenActivity({ appName: 'Initializing...', activity: 'Initializing...' });
      setIsSessionRunning(true); // Trigger effects AFTER setting ID/Time
      console.log(`Session started with ID: ${newSessionId}`);
      startPolling(newSessionId);

    } catch (err) {
      console.error("Start session error:", err);
      setError(`Start Failed: ${err.response?.data?.message || err.message}`);
      setIsSessionRunning(false); setActiveSessionId(null); setSessionStartTime(null); setLatestScreenActivity(null);
       if (err.response?.status === 401) { handleLogout(); }
    } finally { setLoadingAction(false); }
  // Added loadingAction to dependency array
  }, [isSessionRunning, activeSessionId, authToken, loadingAction, handleLogout, startPolling, stopPolling]);

    // Callback from FocusDetector
    const handleFocusUpdate = useCallback((status) => {
        if (isSessionRunning) { setLatestFocusStatus(status); }
    }, [isSessionRunning]);

  // Initial Load Effect
  useEffect(() => {
    let mounted = true;
    // ... (rest of initial load logic remains the same) ...
     console.log("DashboardPage: Initial load effect running...");
     setLoadingInitial(true);
     setError(null); setLatestFocusStatus(null); setLatestScreenActivity(null); setIsSessionRunning(false);
     const load = async () => { /* ... */ }; load();
     return () => { mounted = false; stopPolling(); console.log("DashboardPage: Initial load cleanup."); };
  }, [handleLogout, startPolling, stopPolling]);

  // Effect to Stop Polling When Session Ends
  useEffect(() => {
    if (!isSessionRunning) { stopPolling(); }
  }, [isSessionRunning, stopPolling]);

  // Elapsed Timer Effect
  useEffect(() => {
    // ... (timer logic remains the same) ...
    clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null;
    if (isSessionRunning && sessionStartTime) { /* ... start timer ... */ } else { setElapsedTime(0); }
    return () => { clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null; };
  }, [isSessionRunning, sessionStartTime]);

  // Format Elapsed Time Function
  const formatElapsed = secs => { /* ... same ... */ };

  // Render Loading State
  if (loadingInitial) { /* ... loading ... */ }

  // --- Main Render ---
  return (
    <div className="dashboard-page">
      <Navbar />
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
             <h1>Focus Guardian Dashboard</h1>
             <div className="user-info"> <span className="user-greeting">Welcome back, {user?.name || user?.email || 'User'}!</span> <button onClick={handleLogout} disabled={loadingAction} className="btn btn-primary">Logout</button> </div>
        </header>
        {/* Error */}
        {error && ( <div className="error-alert"><span>{error}</span><button onClick={() => setError(null)}>×</button></div> )}
        {/* Session Control */}
         <section className="session-card">
              <div className="session-status">{isSessionRunning && activeSessionId ? (<> <span className="session-active">Session Active</span> <span className="session-id">ID: ...{activeSessionId.slice(-6)}</span> </>) : ( <p>No active session.</p> )}</div>
              {isSessionRunning && activeSessionId ? ( <> <div className="timer-display">{formatElapsed(elapsedTime)}</div> <div className="btn-group"> <button onClick={handleStopSession} disabled={loadingAction} className="btn btn-danger">{loadingAction ? 'Stopping...' : 'Stop Session'}</button> </div> </> ) : ( <button onClick={handleStartSession} disabled={loadingAction || !authToken} className="btn btn-success">{loadingAction ? 'Starting...' : 'Start New Session'}</button> )}
         </section>
        {/* Current Status */}
        {isSessionRunning && activeSessionId && (
          <section className="analysis-card">
            <h2>Current Status</h2>
            <div className="analysis-content-wrapper">
                <div className="analysis-grid">
                    {/* Focus Status */}
                    <div className="analysis-item"> <strong>Focus Status</strong> {latestFocusStatus ? ( <> {latestFocusStatus.focused ? '✅ Engaged' : '❌ Distracted'} {!latestFocusStatus.focused && latestFocusStatus.reason && ( <span className="distraction-reason"> ({latestFocusStatus.reason})</span> )} </> ) : ('Waiting...') } </div>
                    {/* Screen Activity */}
                    <div className="analysis-item"> <strong>Active Application</strong> {latestScreenActivity?.appName || 'Tracking...'} </div>
                    <div className="analysis-item"> <strong>Estimated Activity</strong> {latestScreenActivity?.activity || 'Tracking...'} </div>
                </div>
                <span className="detection-source-label"> Focus: Webcam | Activity: Screen Tracking </span>
            </div>
          </section>
        )}
        {/* Chatbot */}
        <section className="chatbot-section"> <h2>Productivity Assistant</h2> <div className="chatbot-content"><Chatbot /></div> </section>
        {/* History Link */}
        <div className="session-history-link"> <Link to="/session" className="btn btn-secondary">View Session History & Analytics →</Link> </div>
      </div>
      {/* Focus Detector Component */}
      {authToken && ( <FocusDetector isRunning={isSessionRunning} currentSessionId={activeSessionId} authToken={authToken} onStatusUpdate={handleFocusUpdate} /> )}
      <Footer />
    </div>
  );
}