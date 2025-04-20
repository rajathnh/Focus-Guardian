// src/pages/DashboardPage.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chatbot from '../components/Chatbot';
import './dashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL;

// Axios instance with token
const createAuthAxiosInstance = () => {
  const instance = axios.create();
  const token = localStorage.getItem('focusGuardianToken');
  if (token) {
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
  return instance;
};
const authAxios = createAuthAxiosInstance();

const ANALYSIS_INTERVAL_MS = 120 * 1000;

const stopMediaStreamsGlobal = (webcamStreamRef, screenStreamRef) => {
  let stopped = false;
  if (webcamStreamRef.current) {
    webcamStreamRef.current.getTracks().forEach(t => t.stop());
    webcamStreamRef.current = null;
    stopped = true;
  }
  if (screenStreamRef.current) {
    screenStreamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    stopped = true;
  }
  return stopped;
};

export default function DashboardPage() {
  const navigate = useNavigate();

  // State
  const [user, setUser] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [streamsActive, setStreamsActive] = useState(false);

  // Refs
  const webcamVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const elapsedTimerIntervalRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isSessionRunningRef = useRef(false);

  const handleLogout = useCallback(() => {
    isSessionRunningRef.current = false;
    stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);
    clearInterval(captureIntervalRef.current);
    clearInterval(elapsedTimerIntervalRef.current);
    setStreamsActive(false);
    setActiveSession(null);
    setLatestAnalysis(null);
    setElapsedTime(0);
    localStorage.removeItem('focusGuardianToken');
    localStorage.removeItem('focusGuardianUser');
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const handleStopSession = useCallback(async () => {
    const sessionId = activeSession?._id;
    if (!sessionId) return;
    setError(null);
    setLoadingAction(true);
    isSessionRunningRef.current = false;
    clearInterval(captureIntervalRef.current);
    clearInterval(elapsedTimerIntervalRef.current);
    stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);
    setStreamsActive(false);
    setActiveSession(null);
    setLatestAnalysis(null);
    setElapsedTime(0);
    if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;

    try {
      await authAxios.post(`${API_URL}/api/sessions/${sessionId}/stop`);
    } catch (err) {
      setError(`Failed to notify backend: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoadingAction(false);
    }
  }, [activeSession]);

  const captureAndSend = useCallback(async (sessionId) => {
    if (!isSessionRunningRef.current) return;
    if (activeSession?._id !== sessionId) return;
    if (
      !canvasRef.current ||
      !webcamVideoRef.current?.srcObject ||
      !screenVideoRef.current?.srcObject ||
      webcamVideoRef.current.readyState < 2 ||
      screenVideoRef.current.readyState < 2
    ) return;

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.drawImage(webcamVideoRef.current, 0, 0, 1280, 1280);
    ctx.drawImage(screenVideoRef.current, 1280, 0, 1920, 1280);

    const dataUri = canvasRef.current.toDataURL('image/jpeg', 0.9);

    try {
      const res = await authAxios.post(
        `${API_URL}/api/sessions/data/${sessionId}`,
        { combinedImageUri: dataUri }
      );
      if (isSessionRunningRef.current && activeSession?._id === sessionId) {
        setLatestAnalysis(res.data.analysis);
        setError(null);
      }
    } catch (err) {
      if (!isSessionRunningRef.current) return;
      if (err.response?.status === 401) {
        setError("Authentication error. Logging out.");
        handleLogout();
      } else if (err.response?.status === 404) {
        setError("Session not found. Stopping.");
        handleStopSession();
      } else if (err.response?.status === 429) {
        setError("Rate limited. Will retry.");
        setLatestAnalysis(null);
      } else {
        setError(`Analysis Error: ${err.response?.data?.message || err.message}`);
        setLatestAnalysis(null);
      }
    }
  }, [activeSession, handleLogout, handleStopSession]);

  const handleStartSession = useCallback(async () => {
    if (activeSession || isSessionRunningRef.current) return;
    setError(null);
    setLatestAnalysis(null);
    setElapsedTime(0);
    setLoadingAction(true);
    stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);
    setStreamsActive(false);

    try {
      // First, ensure we have valid references to the video elements
      if (!webcamVideoRef.current || !screenVideoRef.current || !canvasRef.current) {
        throw new Error("Required video or canvas elements not found in the DOM");
      }

      const wStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      const sStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080 }, audio: false });

      webcamStreamRef.current = wStream;
      screenStreamRef.current = sStream;

      // Safely set srcObject only if refs exist
      webcamVideoRef.current.srcObject = wStream;
      screenVideoRef.current.srcObject = sStream;
      
      try {
        // Try to play both videos
        await Promise.allSettled([
          webcamVideoRef.current.play().catch(e => console.error("Webcam play error:", e)),
          screenVideoRef.current.play().catch(e => console.error("Screen play error:", e))
        ]);
      } catch (playError) {
        console.error("Media play error:", playError);
        // Continue even if play fails as the srcObject assignment is more important
      }

      const res = await authAxios.post(`${API_URL}/api/sessions/start`);
      if (!res.data.sessionId) throw new Error("No session ID returned");
      isSessionRunningRef.current = true;
      setActiveSession({ _id: res.data.sessionId, startTime: res.data.startTime || new Date().toISOString() });
      setStreamsActive(true);
    } catch (err) {
      setError(`Start Failed: ${err.message}`);
      stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);
      isSessionRunningRef.current = false;
      setActiveSession(null);
      setStreamsActive(false);
    } finally {
      setLoadingAction(false);
    }
  }, [activeSession]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    setLoadingInitial(true);
    setError(null);

    const load = async () => {
      const token = localStorage.getItem('focusGuardianToken');
      if (!token) {
        if (mounted) handleLogout();
        return;
      }
      if (!authAxios.defaults.headers.common['Authorization']) {
        authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      try {
        const userPromise = authAxios.get(`${API_URL}/api/users/profile`);
        const sessionPromise = authAxios.get(`${API_URL}/api/sessions/current`)
          .catch(e => e.response?.status === 404 ? { data: null } : Promise.reject(e));

        const [uRes, sRes] = await Promise.all([userPromise, sessionPromise]);
        if (!mounted) return;

        setUser(uRes.data);
        if (sRes.data) {
          setActiveSession(sRes.data);
          isSessionRunningRef.current = true;
          setStreamsActive(false);
          setError("Active session found. Streams may need restarting.");
        } else {
          setActiveSession(null);
          isSessionRunningRef.current = false;
          setStreamsActive(false);
        }
      } catch (err) {
        if (!mounted) return;
        if (err.response?.status === 401) {
          handleLogout();
        } else {
          setError(`Could not load dashboard data: ${err.message}`);
          try {
            const u = await authAxios.get(`${API_URL}/api/users/profile`);
            if (mounted) setUser(u.data);
          } catch {}
        }
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [handleLogout]);

  // Capture interval
  useEffect(() => {
    clearInterval(captureIntervalRef.current);
    if (activeSession?._id && streamsActive && isSessionRunningRef.current) {
      const id = activeSession._id;
      const cb = () => {
        if (!isSessionRunningRef.current) {
          clearInterval(captureIntervalRef.current);
          return;
        }
        captureAndSend(id);
      };
      setTimeout(cb, 2000);
      captureIntervalRef.current = setInterval(cb, ANALYSIS_INTERVAL_MS);
    }
    return () => clearInterval(captureIntervalRef.current);
  }, [activeSession, streamsActive, captureAndSend]);

  // Elapsed timer
  useEffect(() => {
    clearInterval(elapsedTimerIntervalRef.current);
    if (activeSession && isSessionRunningRef.current) {
      const start = new Date(activeSession.startTime);
      const tick = () => {
        if (!isSessionRunningRef.current) {
          clearInterval(elapsedTimerIntervalRef.current);
          const stop = new Date();
          setElapsedTime(Math.floor((stop - start) / 1000));
          return;
        }
        setElapsedTime(Math.floor((new Date() - start) / 1000));
      };
      tick();
      elapsedTimerIntervalRef.current = setInterval(tick, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(elapsedTimerIntervalRef.current);
  }, [activeSession]);

  const formatElapsed = secs => {
    if (isNaN(secs) || secs < 0) return '00:00:00';
    const h = String(Math.floor(secs / 3600)).padStart(2, '0');
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  if (loadingInitial) {
    return <div style={{ padding: '20px', textAlign: 'center', fontSize: '1.2em' }}>Loading Dashboard...</div>;
  }

  return (
    <div className="dashboard-page">
      <Navbar />
      <div className="dashboard-container">
        <header className="dashboard-header">
          <h1>Focus Guardian Dashboard</h1>
          <div className="user-info">
            <span className="user-greeting">
              Welcome back, {user?.name || user?.email || 'User'}!
            </span>
            <button onClick={handleLogout} disabled={loadingAction} className="btn btn-primary">
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div className="error-alert">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <section className="session-card">
          <div className="session-status">
            {activeSession ? (
              <>
                <span className="session-active">Session Active</span>
                <span className="session-id">ID: ...{activeSession._id.slice(-6)}</span>
              </>
            ) : (
              <p>No active session.</p>
            )}
          </div>

          {activeSession ? (
            <>
              <div className="timer-display">{formatElapsed(elapsedTime)}</div>
              <div className="btn-group">
                <button
                  onClick={handleStopSession}
                  disabled={loadingAction}
                  className="btn btn-danger"
                >
                  {loadingAction ? 'Stopping...' : 'Stop Session'}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={loadingAction}
              className="btn btn-success"
            >
              {loadingAction ? 'Starting...' : 'Start New Session'}
            </button>
          )}
        </section>

        {activeSession && (
          <section className="analysis-card">
            <h2>Latest Analysis</h2>
            <div className="analysis-grid">
              {latestAnalysis ? (
                <>
                  <div className="analysis-item">
                    <strong>Focus Status</strong>
                    {latestAnalysis.focus ? '✅ Engaged' : '❌ Distracted'}
                  </div>
                  <div className="analysis-item">
                    <strong>Active Application</strong>
                    {latestAnalysis.appName || 'Unknown'}
                  </div>
                  <div className="analysis-item">
                    <strong>Activity Type</strong>
                    {latestAnalysis.activity || 'Unknown'}
                  </div>
                </>
              ) : (
                <p>Collecting initial data...</p>
              )}
            </div>
          </section>
        )}

        <section className="chatbot-section">
          <h2>Productivity Assistant</h2>
          <div className="chatbot-content">
            <Chatbot />
          </div>
        </section>

        <div className="session-history-link">
          <Link to="/session" className="btn btn-secondary">
            View Session History & Analytics →
          </Link>
        </div>
      </div>

      {/* Add hidden video and canvas elements for capturing media */}
      <div style={{ display: 'none' }}>
        <video ref={webcamVideoRef} autoPlay playsInline muted />
        <video ref={screenVideoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} width="3200" height="1280" />
      </div>

      <Footer />
    </div>
  );
}