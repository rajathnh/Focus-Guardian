// src/pages/DashboardPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate ,Link} from 'react-router-dom';

// --- Axios Helper (Keep as before) ---
const createAuthAxios = () => {
  const instance = axios.create();
  const token = localStorage.getItem('focusGuardianToken');
  if (token) instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  return instance;
};

// --- Constants (Keep as before) ---
const ANALYSIS_INTERVAL_MS = 120 * 1000;
const CANVAS_WIDTH = 3200;
const CANVAS_HEIGHT = 1280;
const WEBCAM_DRAW_WIDTH = 1280;
const SCREEN_DRAW_WIDTH = 1920;
const NODE_ENV = "development"

function DashboardPage() {
  const navigate = useNavigate();
  const authAxios = createAuthAxios();

  // --- State ---
  const [user, setUser] = useState(null);
  const [activeSession, setActiveSession] = useState(null); // Holds object { _id: '...', startTime: '...' } or null
  const [latestAnalysis, setLatestAnalysis] = useState(null); // To display last result
  const [loadingUser, setLoadingUser] = useState(true); // Only for initial user load
  const [loadingAction, setLoadingAction] = useState(false); // For start/stop button presses
  const [error, setError] = useState(null);

  // --- Refs ---
  const [webcamStream, setWebcamStream] = useState(null); // Keep streams in state for effect dependency
  const [screenStream, setScreenStream] = useState(null);
  const webcamVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null); // Ref for the capture interval
  const isSessionRunningRef = useRef(false);

  // --- 1. Fetch User Data On Mount ---
  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      setError(null);
      const token = localStorage.getItem('focusGuardianToken');
      if (!token) {
        navigate('/login');
        return;
      }
      try {
        const response = await authAxios.get('/api/users/profile');
        setUser(response.data);
      } catch (err) {
        console.error("Error fetching profile:", err);
        setError("Could not load user profile. Please login again.");
        if (err.response?.status === 401) handleLogout(); // Auto-logout on 401
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch user only once

   // --- Media Stream Handling ---
   const stopMediaStreams = useCallback(() => {
       console.log("Stopping media streams explicitly...");
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach(track => track.stop());
             webcamStreamRef.current = null; // Clear ref
         }
        if (screenStreamRef.current) {
             screenStreamRef.current.getTracks().forEach(track => track.stop());
             screenStreamRef.current = null; // Clear ref
         }
        // Update state if necessary (though direct ref manipulation might be enough here)
        setWebcamStream(null);
         setScreenStream(null);
        if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
   }, []); // Empty dependency array - function identity is stable


   // Use Refs for streams within capture function to avoid useCallback dependency issues
    const webcamStreamRef = useRef(null);
    const screenStreamRef = useRef(null);

    const downloadDataUri = (uri, filename) => {
      const link = document.createElement('a');
      link.href = uri;
      link.download = filename;
      // Append to body to ensure click works reliably, especially in Firefox
      document.body.appendChild(link);
      link.click();
      // Clean up
      document.body.removeChild(link);
    };
// src/pages/DashboardPage.jsx

  // --- Capture and Send Function ---
  // useCallback ensures stable function reference unless dependencies change
  const captureAndSend = useCallback(async (sessionId) => {

    // 1. Check if the session is intended to be running via the ref flag
    if (!isSessionRunningRef.current) {
        console.log("CaptureAndSend check FAILED: isSessionRunningRef.current is false. Aborting capture/send.");
        return;
    }
    // 2. Secondary check using component state (belt-and-suspenders)
    if (!activeSession || activeSession._id !== sessionId) {
         console.warn(`CaptureAndSend state mismatch check: activeSession=${activeSession?._id}, expected=${sessionId}. Aborting.`);
         return;
    }

    // 3. Check necessary refs and video element readiness
    if (!canvasRef.current || !webcamVideoRef.current || !screenVideoRef.current ||
        !webcamVideoRef.current.srcObject || !screenVideoRef.current.srcObject ||
        webcamVideoRef.current.readyState < 2 || screenVideoRef.current.readyState < 2) {
        console.warn("Capture prerequisites not met (refs/streams readiness). Skipping capture for this interval.");
        return; // Silently skip if refs/streams aren't ready
    }

    // If all checks pass, proceed with capture
    console.log(`CaptureAndSend: Capturing frame for active session: ${activeSession._id}`);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    try {
        // Clear canvas and draw images
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle="#eee"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(webcamVideoRef.current, 0, 0, WEBCAM_DRAW_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(screenVideoRef.current, WEBCAM_DRAW_WIDTH, 0, SCREEN_DRAW_WIDTH, CANVAS_HEIGHT);

        // Generate Data URI
        const imageFormatToUse = 'image/jpeg'; // Or 'image/png'
        const quality = 0.8; // Adjust quality for JPEG
        const combinedImageUri = canvas.toDataURL(imageFormatToUse, quality);
        if (NODE_ENV === 'development') { // Only run in development mode
          console.log("DEBUG: Preparing to save image locally...");
          try {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              // Determine file extension based on format used
              const extension = imageFormatToUse.split('/')[1]; // 'jpeg' or 'png'
              const filename = `focus_capture_${timestamp}.${extension}`;
              downloadDataUri(combinedImageUri, filename);
              console.log(`DEBUG: Triggered download: ${filename}`);
          } catch (saveError) {
              console.error("DEBUG: Error triggering local image download:", saveError);
          }
        }
        console.log(`Sending combined image to backend (Session: ${activeSession._id})...`);

        // 4. Make the API call
        const response = await authAxios.post(`/api/sessions/data/${activeSession._id}`, { combinedImageUri });

        // 5. Process successful response
        console.log("Backend Analysis Received:", response.data.analysis);
        setLatestAnalysis(response.data.analysis); // Update UI with results
        setError(null); // Clear any previous *real* errors on success

    } catch (error) {
        // 6. Handle errors
        console.error("Capture/Send Error Encountered:", error); // Log the full error regardless

        // Handle specific error status codes gracefully
        if (error.response?.status === 401) {
            console.error("Unauthorized (401) during capture/send. Logging out.");
            handleLogout(); // Trigger logout
        } else if (error.response?.status === 404) {
             console.warn(`Session ${sessionId} not found on backend (404). Stopping frontend processing.`);
             handleStopSession(); // Stop frontend if session doesn't exist on backend
        // *** MODIFICATION: Silently Ignore 429 Rate Limit Error ***
        } else if (error.response?.status === 429) {
            // Log for debugging but DON'T update UI error state
            console.warn(`Rate limited by backend (429). Request ignored. Message: ${error.response?.data?.message}`);
            // No 'setError' call here
        } else {
             // For any other actual errors (500, network errors, etc.) - Update UI
             setError(`Capture/Send Error: ${error.response?.data?.message || error.message}`);
             setLatestAnalysis(null); // Clear potentially stale analysis on error
        }
    }
 // Ensure dependencies are correct - state setters are stable
}, [authAxios]);

  // --- Effect to Manage Capture Interval ---
  // --- Effect to Manage Capture Interval ---
  useEffect(() => {
    // Log when this effect block runs
    console.log(`Capture Interval Effect RUN - Checking conditions: session=${activeSession?._id}, webcam=${!!webcamStream}, screen=${!!screenStream}, runningRef=${isSessionRunningRef.current}`);

    // Store the current interval ID *before* clearing, for logging purposes
    const previousIntervalId = intervalRef.current;

    // Always try to clear any interval from a previous render/effect run first
    if (intervalRef.current) {
        console.log(`>>> Effect Run: Clearing pre-existing interval ID: ${intervalRef.current}`);
        clearInterval(intervalRef.current);
        intervalRef.current = null; // Ensure ref is nulled after clearing
    } else {
       // Log only if the effect runs when no previous interval existed (e.g., first run)
        if(previousIntervalId === null) { // Avoid logging this every time conditions aren't met initially
          // console.log(">>> Effect Run: No pre-existing interval ID found.");
        }
    }

    // --- Conditions to Start a NEW Interval ---
    // MUST have active session, both streams ready, AND the explicit running flag must be true
    if (activeSession?._id && webcamStream && screenStream && isSessionRunningRef.current) {

        console.log(`+++ CONDITIONS MET: Starting capture interval for session ${activeSession._id} every ${ANALYSIS_INTERVAL_MS}ms`);
        const currentSessionId = activeSession._id; // Capture the session ID for the closure

        // Define the function to be called by setInterval
        const intervalCallback = () => {
            console.log(`--- Interval Timer Fired (ID should be ${intervalRef.current}) ---`);
             // Use the captureAndSend defined in the component scope
            captureAndSend(currentSessionId);
         };

         // Call immediately once after starting
         console.log("--- Firing initial capture/send ---");
        intervalCallback();

         // Start the repeating interval and store its ID
        intervalRef.current = setInterval(intervalCallback, ANALYSIS_INTERVAL_MS);
        console.log(`+++ New Interval ID set: ${intervalRef.current}`);

    } else {
        console.log(`--- Conditions NOT met (Session:${activeSession?._id}, WCam:${!!webcamStream}, Scr:${!!screenStream}, Ref:${isSessionRunningRef.current}) OR RunningRef False - Interval NOT started.`);
    }

    // --- Cleanup Function ---
    // This runs:
    // 1. Before the component unmounts.
    // 2. Before the effect runs again due to a dependency change.
    return () => {
         const intervalIdToClear = intervalRef.current; // Capture the ID at the moment cleanup starts
         console.log(`<<< Running Capture Interval Effect CLEANUP. Interval Ref CURRENTLY holds: ${intervalIdToClear}`);

         if (intervalIdToClear) {
              clearInterval(intervalIdToClear); // Clear the specific timer
              // Only nullify the ref IF the ID we are clearing is still the one stored in the ref.
              // This avoids accidentally nullifying a *new* interval's ID set by a rapid re-render.
              if (intervalRef.current === intervalIdToClear) {
                  intervalRef.current = null;
              }
              console.log(`<<< Interval ${intervalIdToClear} cleared in cleanup.`);
          } else {
              console.log("<<< Cleanup: No active interval ID found in ref to clear.");
         }
    };
// *** Re-include captureAndSend because the intervalCallback uses it ***
}, [activeSession, webcamStream, screenStream, captureAndSend]); // Dependencies: The effect depends on these states/functions

   // --- Logout Handler ---
   const handleLogout = useCallback(() => {
    console.log("Executing Logout Handler");
     isSessionRunningRef.current = false;
        stopMediaStreams();
         if (intervalRef.current) clearInterval(intervalRef.current);
         localStorage.removeItem('focusGuardianToken');
        localStorage.removeItem('focusGuardianUser');
         navigate('/login');
     // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopMediaStreams, navigate]); // Add dependencies

  // --- Start Session Handler ---
  const handleStartSession = useCallback(async () => {
    setError(null);
    setLatestAnalysis(null);
    if (activeSession) { setError("Session already active."); return; }

     // Ensure any old streams are stopped
    stopMediaStreams(); // Call before requesting new ones


    setLoadingAction(true);
    try {
        console.log("Requesting permissions...");
         // Assign streams to refs and state
        const wStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
         const sStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false }); // Added cursor display
        webcamStreamRef.current = wStream;
         screenStreamRef.current = sStream;


        if (webcamVideoRef.current) webcamVideoRef.current.srcObject = wStream;
         if (screenVideoRef.current) screenVideoRef.current.srcObject = sStream;
        // Play the videos silently in the hidden elements (required by some browsers to keep stream active)
         webcamVideoRef.current?.play().catch(e => console.warn("Webcam play() error:", e));
         screenVideoRef.current?.play().catch(e => console.warn("Screen play() error:", e));


        console.log("Permissions granted. Calling backend...");
        const response = await authAxios.post('/api/sessions/start');
        const newSessionId = response.data.sessionId;
         console.log("Backend session started:", newSessionId);


        // Set state AFTER successful backend call
        setWebcamStream(wStream); // Update state to trigger effect
        setScreenStream(sStream);
        setActiveSession({ _id: newSessionId, startTime: new Date().toISOString() });
        isSessionRunningRef.current = true; // SET FLAG TO TRUE on successful start
 console.log("Session Running Ref set to TRUE");

    } catch (err) {
        console.error("Error starting session:", err);
        setError(`Failed to start: ${err.message || 'Permission denied/API error'}`);
         stopMediaStreams(); // Cleanup on failure
         isSessionRunningRef.current = false;
    } finally {
        setLoadingAction(false);
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [activeSession, stopMediaStreams, authAxios]); // Added missing dependencies


  // --- Stop Session Handler ---
   const handleStopSession = useCallback(async () => {
       setError(null);
       if (!activeSession?._id) { setError("No session to stop."); return; }
       setLoadingAction(true);

        const sessionIdToStop = activeSession._id;
        isSessionRunningRef.current = false;
        console.log("Session Running Ref set to FALSE by Stop");
       // Clear interval FIRST
       if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
       }
       // Stop media streams
        stopMediaStreams();

        // Clear active session state *after* stopping streams/interval
       setActiveSession(null);
       setLatestAnalysis(null); // Clear last analysis display

        try {
            console.log(`Calling backend to stop session: ${sessionIdToStop}`);
             await authAxios.post(`/api/sessions/${sessionIdToStop}/stop`);
             console.log("Backend session stopped.");
            // Maybe fetch final aggregate stats here if needed
            // const statsRes = await authAxios.get('/api/sessions/stats');
            // if (statsRes.data) setStats(statsRes.data); // Assuming you want to display stats

        } catch (err) {
            console.error("Error stopping session backend:", err);
             setError(`Stop Failed: ${err.response?.data?.message || err.message}`);
             // Note: Session is already stopped on frontend side.
        } finally {
            setLoadingAction(false);
         }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSession, stopMediaStreams, authAxios]); // Added dependencies

  // --- Rendering ---
  if (loadingUser) return <div>Loading User Data...</div>;
  if (!user && !loadingUser) return <div>Error: Please <Link to="/login">Login</Link>.</div>; // Use Link


  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1>Focus Guardian</h1>
         <span>Welcome, {user?.name || user?.email}!</span>
         <button onClick={handleLogout} disabled={loadingAction}>Logout</button>
      </div>

       {error && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '15px' }}>Error: {error}</p>}

      {/* Session Control & Status */}
       <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px', backgroundColor: activeSession ? '#e6ffed' : '#fff' }}>
         <h2>Session Status</h2>
         {!activeSession ? (
           <>
             <p>No active session.</p>
            <button onClick={handleStartSession} disabled={loadingAction}>
               {loadingAction ? 'Starting...' : 'Start New Focus Session'}
            </button>
          </>
        ) : (
           <>
            <p style={{ color: 'green', fontWeight: 'bold' }}>Session Active (ID: {activeSession._id})</p>
            <p>Started: {new Date(activeSession.startTime).toLocaleString()}</p>
            <button onClick={handleStopSession} disabled={loadingAction}>
               {loadingAction ? 'Stopping...' : 'Stop Session'}
            </button>
          </>
        )}
        {/* Show stream status for feedback */}
         {activeSession && webcamStream && <p><small>✔️ Webcam Active</small></p>}
        {activeSession && screenStream && <p><small>✔️ Screen Sharing Active</small></p>}
      </div>

      {/* Display Latest Analysis */}
       {activeSession && latestAnalysis && (
         <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px', backgroundColor: '#f0f8ff' }}>
           <h3>Latest Analysis Result:</h3>
           <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
               {JSON.stringify(latestAnalysis, null, 2)}
           </pre>
         </div>
       )}
       {activeSession && !latestAnalysis && !error && <p>Waiting for first analysis...</p>}


       {/* Stats/Charts Area (To be added later) */}
      {/*
      <div style={{ border: '1px solid #eee', padding: '15px', marginTop: '20px' }}>
         <h2>Statistics & Analytics</h2>
         <p>Overall stats and charts will be displayed here...</p>
      </div>
      */}

       {/* --- Hidden Elements (keep as before) --- */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0 }}>
          <video ref={webcamVideoRef} playsInline autoPlay muted width={WEBCAM_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
          <video ref={screenVideoRef} playsInline autoPlay muted width={SCREEN_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}></canvas>
      </div>
    </div>
  );
}

export default DashboardPage;