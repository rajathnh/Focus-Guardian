// src/pages/DashboardPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Chatbot from '../components/Chatbot'; // <-- Chatbot component is imported here

// --- Axios Helper ---
const createAuthAxiosInstance = () => {
    // console.log("Creating Auth Axios Instance...");
    const instance = axios.create({ /* baseURL if needed */ });
    const token = localStorage.getItem('focusGuardianToken');
    if (token) {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("Auth Axios: Token Not Found.");
    }
    return instance;
};
const authAxios = createAuthAxiosInstance(); // Stable instance

// --- Constants ---
const ANALYSIS_INTERVAL_MS = 120 * 1000; // 120 seconds = 2 minutes
const CANVAS_WIDTH = 3200; // Example: Adjust based on desired capture resolution
const CANVAS_HEIGHT = 1280;
const WEBCAM_DRAW_WIDTH = 1280; // Width allocated for webcam on canvas
const SCREEN_DRAW_WIDTH = 1920; // Width allocated for screen capture on canvas
// Ensure CANVAS_WIDTH = WEBCAM_DRAW_WIDTH + SCREEN_DRAW_WIDTH
const NODE_ENV = process.env.NODE_ENV; // For development helpers

// --- Global Helper Function to Stop Streams ---
const stopMediaStreamsGlobal = (webcamStreamRef, screenStreamRef) => {
    console.log("Executing stopMediaStreamsGlobal...");
    let stopped = false;
    if (webcamStreamRef.current) {
        console.log("Stopping webcam tracks...");
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
        stopped = true;
    }
    if (screenStreamRef.current) {
        console.log("Stopping screen tracks...");
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
        stopped = true;
    }
    if (stopped) console.log("Media streams cleanup finished.");
    return stopped; // Indicate if streams were actually stopped
};

// --- THE COMPONENT ---
function DashboardPage() {
    const navigate = useNavigate();

    // --- State ---
    const [user, setUser] = useState(null);
    const [activeSession, setActiveSession] = useState(null); // Holds session details { _id, startTime, ... }
    const [latestAnalysis, setLatestAnalysis] = useState(null); // Holds { focus, appName, activity }
    const [loadingInitial, setLoadingInitial] = useState(true); // Combined initial loading state
    const [loadingAction, setLoadingAction] = useState(false); // For Start/Stop button actions
    const [error, setError] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    // State to track if streams are *supposed* to be active (used to trigger effects)
    const [streamsActive, setStreamsActive] = useState(false);

    // --- Refs ---
    const webcamVideoRef = useRef(null);
    const screenVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const captureIntervalRef = useRef(null);
    const elapsedTimerIntervalRef = useRef(null);
    const webcamStreamRef = useRef(null);     // Holds actual MediaStream object
    const screenStreamRef = useRef(null);     // Holds actual MediaStream object
    const isSessionRunningRef = useRef(false); // Flag to control execution loops

    // --- Stable Logout Handler ---
    const handleLogout = useCallback(() => {
        console.log("Executing Logout Handler");
        isSessionRunningRef.current = false; // Immediately signal loops to stop
        stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef); // Stop streams via ref
        if (captureIntervalRef.current) clearInterval(captureIntervalRef.current); captureIntervalRef.current = null;
        if (elapsedTimerIntervalRef.current) clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null;
        setStreamsActive(false); // Update stream state
        setActiveSession(null); // Clear session state
        setLatestAnalysis(null);
        setElapsedTime(0);
        localStorage.removeItem('focusGuardianToken');
        localStorage.removeItem('focusGuardianUser');
        setUser(null); // Clear user state
        navigate('/login');
    }, [navigate]); // Doesn't depend on stream refs directly


    // --- Stop Session Handler (calls backend) ---
    const handleStopSession = useCallback(async () => {
        const sessionIdToStop = activeSession?._id; // Get ID from state *before* clearing
        if (!sessionIdToStop) { console.warn("Stop: No active session state found."); return; }

        console.log("Executing handleStopSession for", sessionIdToStop);
        setError(null); setLoadingAction(true);
        isSessionRunningRef.current = false; // Signal loops to stop immediately

        // Clear intervals and stop streams
        if (captureIntervalRef.current) clearInterval(captureIntervalRef.current); captureIntervalRef.current = null;
        if (elapsedTimerIntervalRef.current) clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null;
        stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);

        // Clear frontend state related to the active session
        setStreamsActive(false);
        setActiveSession(null);
        setLatestAnalysis(null);
        setElapsedTime(0);
        // Clear video elements visually
        if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;

        try {
           console.log("Calling backend stop API...");
           await authAxios.post(`/api/sessions/${sessionIdToStop}/stop`);
           console.log("Backend session stopped successfully.");
        } catch (err) {
            console.error("Error calling backend stop API:", err);
            // Display error, but frontend state is already cleared
            setError(`Failed to notify backend of stop: ${err.response?.data?.message || err.message}`);
        } finally {
            setLoadingAction(false);
        }
    }, [activeSession]); // Depends on activeSession state to get the ID


    // --- Capture and Send Image Data ---
    const captureAndSend = useCallback(async (sessionId) => {
        // Primary check: Use the ref flag
        if (!isSessionRunningRef.current) { console.log(`Capture/Send: Aborted - Running Ref False`); return; }
        // Secondary check: Ensure session ID matches state (belt-and-suspenders)
        if (activeSession?._id !== sessionId) { console.warn(`Capture/Send: Aborted - Session ID mismatch (expected ${sessionId}, got ${activeSession?._id})`); return; }
        // Check elements are ready
        if (!canvasRef.current || !webcamVideoRef.current || !screenVideoRef.current ||
             !webcamVideoRef.current.srcObject || !screenVideoRef.current.srcObject ||
              webcamVideoRef.current.readyState < 2 || screenVideoRef.current.readyState < 2) { // readyState >= 2 (HAVE_CURRENT_DATA) is often enough
             console.warn("Capture/Send: Aborted - Video elements not ready."); return;
        }

        console.log(`CaptureAndSend: Capturing for ${sessionId}`);
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d', { willReadFrequently: true }); // Add willReadFrequently hint

        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Optional: Draw background if needed
            // ctx.fillStyle="#eee"; ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw webcam on left, screen on right
            ctx.drawImage(webcamVideoRef.current, 0, 0, WEBCAM_DRAW_WIDTH, CANVAS_HEIGHT);
            ctx.drawImage(screenVideoRef.current, WEBCAM_DRAW_WIDTH, 0, SCREEN_DRAW_WIDTH, CANVAS_HEIGHT);

             const imageFormatToUse = 'image/jpeg'; const quality = 0.9; // Adjust quality (0.8-0.95 often good balance)
             const combinedImageUri = canvas.toDataURL(imageFormatToUse, quality);

             // Optional Debug Download
             if (NODE_ENV === 'development' && Math.random() < 0.05) { // Download occasionally for check
                const link = document.createElement('a');
                link.download = `capture_${Date.now()}.jpg`;
                link.href = combinedImageUri;
                link.click();
             }

            console.log(`Sending combined image to backend (size: ~${Math.round(combinedImageUri.length * 3/4 / 1024)} kB)...`);
            const response = await authAxios.post(`/api/sessions/data/${sessionId}`, { combinedImageUri });

            // Update latest analysis only if session is still running
             if (isSessionRunningRef.current && activeSession?._id === sessionId) {
                console.log("Backend Analysis Result:", response.data.analysis);
                setLatestAnalysis(response.data.analysis);
                setError(null); // Clear previous errors on success
            }
        } catch (error) {
            console.error("Capture/Send Error:", error);
            // Check if still supposed to be running before handling error
            if (isSessionRunningRef.current && activeSession?._id === sessionId) {
                if (error.response?.status === 401) {
                    setError("Authentication error. Logging out.");
                    handleLogout();
                } else if (error.response?.status === 404) {
                    setError("Session not found on backend. Stopping session.");
                    handleStopSession(); // Stop frontend if backend session is gone
                } else if (error.response?.status === 429) {
                    console.warn(`Rate limited by backend (429). Analysis skipped.`);
                    setError("Analysis rate limited by server. Will retry."); // Inform user
                    setLatestAnalysis(null); // Clear last analysis as it's stale
                } else {
                    setError(`Analysis Error: ${error.response?.data?.message || error.message}`);
                    setLatestAnalysis(null); // Clear last analysis on error
                }
            } else {
                console.log("Capture/Send error occurred, but session already stopped/changed. Ignoring error display.");
            }
        }
    }, [activeSession, handleLogout, handleStopSession]); // Dependencies are correct


   // --- Start Session Handler ---
    const handleStartSession = useCallback(async () => {
        if (activeSession || isSessionRunningRef.current) { console.warn("Start: Session already active or running flag set."); return; }

        setError(null); setLatestAnalysis(null); setElapsedTime(0); setLoadingAction(true);
        // Ensure any lingering streams/refs are stopped first
        stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef);
        setStreamsActive(false); // Reset stream state

        let wStream = null; let sStream = null; let newSession = null;
        try {
            // 1. Get Media Streams
            console.log("Requesting media permissions...");
            wStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }); // Request specific size if needed
            sStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always", width: 1920, height: 1080 }, audio: false }); // Request specific size if needed
            console.log("Permissions granted.");

            // Assign to refs immediately
            webcamStreamRef.current = wStream;
            screenStreamRef.current = sStream;

            // Set video sources and play
            if (webcamVideoRef.current) webcamVideoRef.current.srcObject = wStream;
            if (screenVideoRef.current) screenVideoRef.current.srcObject = sStream;
            // Use Promise.allSettled for playing to avoid one failing stopping the other
            await Promise.allSettled([
                 webcamVideoRef.current?.play(),
                 screenVideoRef.current?.play()
            ]);
            console.log("Streams attached and playing.");

            // 2. Start Backend Session
            console.log("Starting backend session...");
            const response = await authAxios.post('/api/sessions/start');
            newSession = response.data; // Expecting { sessionId: '...', startTime: '...' } or similar
            if (!newSession || !newSession.sessionId) { throw new Error("Backend did not return a valid session ID."); }
            console.log("Backend session started:", newSession.sessionId);

            // 3. Update Frontend State and Flags (Crucial Order)
            isSessionRunningRef.current = true; // Set flag FIRST
            setActiveSession({ _id: newSession.sessionId, startTime: newSession.startTime || new Date().toISOString() }); // Update session state
            setStreamsActive(true); // Set stream state to trigger effects
            console.log("Start Session: State updated, running ref TRUE.");

         } catch (err) {
             console.error("Start Session Error:", err);
             setError(`Start Failed: ${err.message}. Please ensure permissions are granted.`);
             stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef); // Clean up streams on failure
             isSessionRunningRef.current = false; // Ensure flag is off
             setActiveSession(null); // Reset state
             setStreamsActive(false);
         } finally {
             setLoadingAction(false);
         }
    }, [activeSession, handleLogout]); // activeSession prevents double start


    // --- Effect 1: Initial Load (User + Current Session) ---
    useEffect(() => {
        console.log("Running Effect: Initial Load");
        let isMounted = true;
        setLoadingInitial(true); // Start loading
        setError(null); // Clear previous errors on load

        const loadInitialData = async () => {
            const token = localStorage.getItem('focusGuardianToken');
            if (!token) { console.log("InitialLoad: No token"); if(isMounted) handleLogout(); return; }

            // Ensure auth header is set before requests
            if (!authAxios.defaults.headers.common['Authorization']) {
                authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }

            try {
                console.log("InitialLoad: Fetching user profile...");
                const userProfilePromise = authAxios.get('/api/users/profile');
                console.log("InitialLoad: Fetching current session...");
                // Use .catch on the session promise individually to handle the expected 404
                const currentSessionPromise = authAxios.get('/api/sessions/current')
                    .catch(sessionError => {
                        // If the error is specifically a 404 for the session, resolve with null
                        if (sessionError.response?.status === 404) {
                            console.log("InitialLoad: No active session found (404 received).");
                            return { data: null }; // Mimic successful response with no data
                        }
                        // Otherwise, re-throw the error to be caught by the outer catch
                        throw sessionError;
                    });

                // Wait for both promises (session promise now resolves with {data: null} on 404)
                const [userResponse, sessionResponse] = await Promise.all([userProfilePromise, currentSessionPromise]);

                if (!isMounted) return;

                // Set User
                setUser(userResponse.data);
                console.log("InitialLoad: Profile loaded.");

                // Set Session (sessionResponse.data will be null if 404 occurred)
                if (sessionResponse.data) {
                    console.log("InitialLoad: Found active session:", sessionResponse.data._id);
                    setActiveSession(sessionResponse.data);
                    isSessionRunningRef.current = true;
                    // Inform user streams might need restarting after refresh
                    // Setting streamsActive to false ensures capture interval doesn't start automatically
                    setStreamsActive(false);
                    setError("Active session found from previous load. Streams may need restarting.");
                } else {
                    // This block now runs if session was null OR if 404 occurred
                    setActiveSession(null);
                    isSessionRunningRef.current = false;
                    setStreamsActive(false);
                }
                // Clear general error if we reached here successfully (even if session was 404)
                // setError(null); // Might still want to keep the "Streams may need restarting" message

            } catch (err) {
                 // This outer catch now handles errors from userProfilePromise OR non-404 errors from sessionPromise
                 console.error("Error during initial load (Outer Catch):", err);
                 if (!isMounted) return;
                 if (err.response?.status === 401) {
                     handleLogout();
                 } else {
                     // Show a general error, potentially try loading user profile again
                     setError(`Could not load dashboard data: ${err.message}`);
                     try {
                         const userResponse = await authAxios.get('/api/users/profile');
                         if (isMounted) setUser(userResponse.data);
                     } catch (userErr) { /* ... handle profile error or logout ... */ }
                 }
            } finally {
                if (isMounted) setLoadingInitial(false); // Stop loading
            }
        };

        loadInitialData();

        return () => { isMounted = false; console.log("Initial Load Effect Cleanup"); };
    }, [handleLogout]); // Dependency only on stable handleLogout


   // --- Effect 2: Capture Interval ---
    useEffect(() => {
        console.log(`Capture Interval Effect Check: session=${activeSession?._id}, streamsActive=${streamsActive}, runningRef=${isSessionRunningRef.current}`);
        // Clear any existing interval first
        if (captureIntervalRef.current) {
            console.log(`--- Clearing existing Capture Interval ID ${captureIntervalRef.current}`);
            clearInterval(captureIntervalRef.current);
            captureIntervalRef.current = null;
        }

        // Start interval only if session is marked active, streams are supposed to be active, and the running flag is true
         if (activeSession?._id && streamsActive && isSessionRunningRef.current) {
             console.log(`+++ Starting Capture Interval for ${activeSession._id}`);
             const currentSessionId = activeSession._id; // Capture ID at interval creation

             // Use a wrapper function to ensure the running ref is checked *every time* before capture
             const intervalCallback = () => {
                if (!isSessionRunningRef.current) {
                    console.warn(`Capture Interval Fired, but Running Ref is FALSE. Stopping interval.`);
                     if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
                     captureIntervalRef.current = null;
                    return;
                 }
                console.log(`--- Capture Interval Fired for ${currentSessionId} ---`);
                captureAndSend(currentSessionId); // Call the capture function
             };

             // Initial capture attempt shortly after starting
             setTimeout(intervalCallback, 2000); // Delay slightly to ensure streams are fully ready

             // Set the repeating interval
             captureIntervalRef.current = setInterval(intervalCallback, ANALYSIS_INTERVAL_MS);
             console.log(`+++ Capture Interval ID ${captureIntervalRef.current} set.`);
         } else {
             console.log("--- Capture Interval: Conditions NOT met, interval not started/cleared.");
         }

        // Cleanup function: Clears the interval when dependencies change or component unmounts
        return () => {
            if (captureIntervalRef.current) {
                console.log(`--- Capture Interval CLEANUP: Clearing Interval ID ${captureIntervalRef.current}`);
                clearInterval(captureIntervalRef.current);
                captureIntervalRef.current = null;
            }
        };
    // Dependencies: Re-run when session ID changes OR when stream state changes
    }, [activeSession, streamsActive, captureAndSend]); // captureAndSend is stable via useCallback

    // --- Effect 3: Elapsed Timer ---
    useEffect(() => {
        console.log(`Elapsed Timer Effect Check: session=${activeSession?._id}`);
        // Clear existing timer first
         if (elapsedTimerIntervalRef.current) {
            // console.log(`--- Clearing existing Elapsed Timer ID ${elapsedTimerIntervalRef.current}`);
            clearInterval(elapsedTimerIntervalRef.current);
            elapsedTimerIntervalRef.current = null;
         }

        // Start timer only if session is active AND the running flag is true
        if (activeSession && isSessionRunningRef.current) {
             console.log(`+++ Starting Elapsed Timer for ${activeSession._id}`);
             const startTime = activeSession.startTime ? new Date(activeSession.startTime) : new Date(); // Use start time from session data

            const calculateElapsedTime = () => {
                 // Check flag inside too, in case stop happens between intervals
                 if (!isSessionRunningRef.current) {
                     // console.warn("Elapsed Timer Fired, but Running Ref is FALSE. Stopping timer.");
                      if (elapsedTimerIntervalRef.current) clearInterval(elapsedTimerIntervalRef.current);
                      elapsedTimerIntervalRef.current = null;
                      setElapsedTime(prev => { // Calculate final time based on start/stop
                        const stopTime = new Date();
                        return Math.max(0, Math.floor((stopTime.getTime() - startTime.getTime())/1000));
                      });
                     return;
                  }
                 const now = new Date();
                 const seconds = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
                setElapsedTime(seconds); // Update state
             };

            calculateElapsedTime(); // Initial call
            elapsedTimerIntervalRef.current = setInterval(calculateElapsedTime, 1000); // Run every second
             console.log(`+++ Elapsed Timer ID ${elapsedTimerIntervalRef.current} set.`);
        } else {
             // If no active session or not running, ensure timer is 0
             if (elapsedTime !== 0) setElapsedTime(0);
         }

        // Cleanup function: Clears timer on dependency change or unmount
        return () => {
            if (elapsedTimerIntervalRef.current) {
                // console.log(`--- Elapsed Timer CLEANUP: Clearing Timer ID ${elapsedTimerIntervalRef.current}`);
                clearInterval(elapsedTimerIntervalRef.current);
                elapsedTimerIntervalRef.current = null;
            }
        };
    }, [activeSession]); // Depends only on activeSession existence/startTime


   // --- Helper function ---
    const formatElapsedTime = (totalSeconds) => {
        if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

   // --- Rendering ---
    if (loadingInitial) return <div style={{padding: '20px', textAlign: 'center', fontSize: '1.2em'}}>Loading Dashboard...</div>;
    // User check is handled by initial load effect redirecting

    // Button Styles
    const buttonStyle = { padding: '10px 15px', fontSize: '1em', cursor: 'pointer', borderRadius: '5px', border: 'none', marginRight: '10px' };
    const startButtonStyle = { ...buttonStyle, backgroundColor: '#28a745', color: 'white' };
    const stopButtonStyle = { ...buttonStyle, backgroundColor: '#dc3545', color: 'white' };
    const disabledButtonStyle = { ...buttonStyle, backgroundColor: '#6c757d', color: '#ccc', cursor: 'not-allowed' };
    const logoutButtonStyle = { ...buttonStyle, backgroundColor: '#007bff', color: 'white' };

    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
         {/* Header */}
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
           <h1>Focus Guardian</h1>
           <span>Welcome, {user?.name || user?.email || 'User'}!</span>
           <button
             onClick={handleLogout}
             disabled={loadingAction}
             style={loadingAction ? disabledButtonStyle : logoutButtonStyle}
            >
                Logout
            </button>
        </div>

         {/* Error Display Area */}
         {error && (
            <p style={{ color: '#D8000C', backgroundColor: '#FFD2D2', border: '1px solid #D8000C', padding: '10px', marginBottom: '15px', borderRadius: '5px' }}>
                Error: {error}
                {/* Optionally add a dismiss button */}
                 <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#D8000C', fontWeight: 'bold', cursor: 'pointer' }}>X</button>
             </p>
         )}

         {/* Session Control & Status */}
        <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '15px', marginBottom: '20px', backgroundColor: activeSession ? '#e9fdee' : '#f8f9fa' }}>
           <h2 style={{marginTop: 0}}>Session Status</h2>
           {!activeSession ? (
             <>
                <p>No active session.</p>
                <button
                    onClick={handleStartSession}
                    disabled={loadingAction}
                    style={loadingAction ? disabledButtonStyle : startButtonStyle}
                >
                    {loadingAction ? 'Starting...' : 'Start New Focus Session'}
                </button>
             </>
           ) : (
             <>
                <p style={{ color: 'green', fontWeight: 'bold' }}>Session Active (ID: ...{activeSession._id.slice(-6)})</p>
                <p style={{fontSize: '0.9em', color: '#555'}}>Started: {new Date(activeSession.startTime).toLocaleString()}</p>
                <p style={{ fontSize: '1.8em', fontWeight: 'bold', margin: '15px 0', color: '#333', textAlign: 'center', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
                  {formatElapsedTime(elapsedTime)} {/* Display Timer */}
                 </p>
                 <button
                    onClick={handleStopSession}
                    disabled={loadingAction}
                    style={loadingAction ? disabledButtonStyle : stopButtonStyle}
                 >
                    {loadingAction ? 'Stopping...' : 'Stop Session'}
                 </button>
                <div style={{marginTop: '10px', fontSize: '0.9em'}}>
                   {/* Show stream status based on state variable */}
                   {streamsActive ? (
                        <>
                            <span style={{ color: 'green', marginRight: '15px' }}>✔️ Streams Active</span>
                            {/* Optionally add indicators for webcam/screen specifically if needed */}
                        </>
                   ) : (
                        <span style={{ color: 'orange' }}>⚠️ Streams Not Initialized (Session may be active from previous load)</span>
                        // TODO: Maybe add a button here to re-try getting streams if needed after refresh?
                   )}
                 </div>
             </>
           )}
         </div>

        {/* Display Latest Analysis */}
         {activeSession && ( // Only show analysis if session is active
            <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', marginBottom: '20px', backgroundColor: '#f8f9fa' }}>
               <h3 style={{marginTop: 0}}>Latest Analysis <span style={{fontSize: '0.8em', fontWeight: 'normal'}}>(Updates ~every {ANALYSIS_INTERVAL_MS/1000}s)</span></h3>
               {latestAnalysis ? (
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #eee'}}>
                        <p style={{margin: '0 0 5px 0'}}><strong>Focus:</strong> {latestAnalysis.focus ? '✅ Yes' : '❌ No'}</p>
                        <p style={{margin: '0 0 5px 0'}}><strong>App:</strong> {latestAnalysis.appName || 'Unknown'}</p>
                        <p style={{margin: 0}}><strong>Activity:</strong> {latestAnalysis.activity || 'Unknown'}</p>
                    </div>
               ) : error && !error.startsWith("Stop failed") && !error.startsWith("Analysis rate limited") ? ( // Show error unless it's expected stop/rate limit
                    <p style={{ color: 'orange' }}>Analysis Error occurred.</p>
               ) : (
                    <p>Waiting for first analysis data...</p>
               )}
             </div> // Closing div for the analysis inner content wrapper
         )} 


         {/* ===================================== */}
         {/* ====== CHATBOT SECTION ADDED HERE ====== */}
         {/* ===================================== */}
         <hr style={{ margin: '25px 0' }} /> {/* Optional visual separator */}
         <div style={{ border: '1px solid #eee', padding: '15px', marginTop: '20px', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
            <h2 style={{ marginTop: 0 }}>Chat Assistant</h2>
            <Chatbot /> {/* <-- Use the imported component */}
         </div>
         {/* ===================================== */}
         {/* ====== END OF CHATBOT SECTION ======= */}
         {/* ===================================== */}


         {/* Stats/History Link */}
         <div style={{ border: '1px solid #eee', padding: '15px', marginTop: '20px', borderRadius: '8px', textAlign: 'center' }}>
            <Link to="/session" style={{ textDecoration: 'none', color: '#007bff', fontWeight: 'bold' }}>
                View Session History & Detailed Analytics →
            </Link>
         </div>

         {/* Hidden Elements - Keep these */}
         <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', top: '-9999px', left: '-9999px', opacity: 0}}>
            <video ref={webcamVideoRef} playsInline autoPlay muted width={WEBCAM_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
            <video ref={screenVideoRef} playsInline autoPlay muted width={SCREEN_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}></canvas>
         </div>
      </div>
   );
}

export default DashboardPage;