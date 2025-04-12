// src/pages/DashboardPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

// --- Axios Helper ---
const createAuthAxiosInstance = () => {
  console.log("Creating Auth Axios Instance..."); // Log creation
  const instance = axios.create();
  const token = localStorage.getItem('focusGuardianToken');
  if (token) {
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn("Auth Axios: Token Not Found when creating instance.");
  }
  return instance;
};

// *** CREATE AXIOS INSTANCE OUTSIDE THE COMPONENT ***
// This ensures the reference remains stable across renders
const authAxios = createAuthAxiosInstance();

// --- Constants ---
const ANALYSIS_INTERVAL_MS = 120 * 1000; // 120 seconds
const CANVAS_WIDTH = 3200;
const CANVAS_HEIGHT = 1280;
const WEBCAM_DRAW_WIDTH = 1280;
const SCREEN_DRAW_WIDTH = 1920;
const NODE_ENV = process.env.NODE_ENV;

// --- Global Helper Function to Stop Streams ---
// Moved outside for stable reference
const stopMediaStreamsGlobal = (webcamStreamRef, screenStreamRef, setWebcamStream, setScreenStream, webcamVideoRef, screenVideoRef) => {
    console.log("Executing stopMediaStreamsGlobal function...");
    let stoppedWebcam = false;
    let stoppedScreen = false;

    if (webcamStreamRef.current) {
        console.log("Stopping webcam tracks...");
        webcamStreamRef.current.getTracks().forEach(track => { track.stop(); console.log(`Stopped webcam track: ${track.id}`); });
        webcamStreamRef.current = null;
        stoppedWebcam = true;
    }
    if (screenStreamRef.current) {
        console.log("Stopping screen tracks...");
        screenStreamRef.current.getTracks().forEach(track => { track.stop(); console.log(`Stopped screen track: ${track.id}`); });
        screenStreamRef.current = null;
        stoppedScreen = true;
    }

    // Use setters passed from the component
    if (stoppedWebcam) setWebcamStream(null);
    if (stoppedScreen) setScreenStream(null);

    // Clear video elements
    if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;

    console.log("Media streams cleanup finished via global function.");
};


// --- THE COMPONENT ---
function DashboardPage() {
  const navigate = useNavigate();
  // *** Axios instance is now taken from the outer scope, no need to create here ***

  // --- State ---
  const [user, setUser] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [webcamStream, setWebcamStream] = useState(null); // State reflects if stream *should* be running
  const [screenStream, setScreenStream] = useState(null);

  // --- Refs ---
  const webcamVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const elapsedTimerIntervalRef = useRef(null);
  const webcamStreamRef = useRef(null);     // Holds actual MediaStream object
  const screenStreamRef = useRef(null);     // Holds actual MediaStream object
  const isSessionRunningRef = useRef(false); // Primary execution flag

  // --- Logout Handler ---
  // Declare *before* useEffect that uses it
  const handleLogout = useCallback(() => {
    console.log("Executing Logout Handler");
    isSessionRunningRef.current = false;
    // Call the global helper, passing refs and *current* setters
    stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef, setWebcamStream, setScreenStream, webcamVideoRef, screenVideoRef);
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current); captureIntervalRef.current = null;
    if (elapsedTimerIntervalRef.current) clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null;

    localStorage.removeItem('focusGuardianToken');
    localStorage.removeItem('focusGuardianUser');
    setActiveSession(null);
    setUser(null);
    navigate('/login');
  }, [navigate]); // Now only depends on navigate, setters are stable

  // --- 1. Fetch User Data On Mount ---
  useEffect(() => {
      console.log("Running Effect: Fetch User Profile");
      let isMounted = true;
      const fetchUser = async () => {
           setLoadingData(true); setError(null);
          const token = localStorage.getItem('focusGuardianToken');
          if (!token) { console.log("FetchUser: No token"); if(isMounted) navigate('/login'); return; }
         try {
              const response = await authAxios.get('/api/users/profile');
              if (isMounted) setUser(response.data);
             console.log("FetchUser: Profile loaded.");
         } catch (err) {
              console.error("Error fetching profile:", err);
              if (isMounted) setError("Could not load user profile.");
              if (err.response?.status === 401 && isMounted) { handleLogout(); } // Needs stable handleLogout
          } finally {
              if (isMounted) setLoadingData(false);
          }
      };
      fetchUser();
      return () => { isMounted = false; };
  }, [navigate, handleLogout]); // Dependency: handleLogout, navigate (authAxios removed as it's stable)

   // --- Stop Session Handler ---
   // Define callbacks used within captureAndSend first
   const handleStopSession = useCallback(async () => {
       if (!activeSession?._id) { console.warn("Stop: No active session"); return; }
       console.log("Executing handleStopSession for", activeSession._id);
       setError(null); setLoadingAction(true);
        const sessionIdToStop = activeSession._id;

       isSessionRunningRef.current = false;
        console.log("Stop Handler: Set Running Ref FALSE");

       if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }
        if (elapsedTimerIntervalRef.current) { clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null; }
       stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef, setWebcamStream, setScreenStream, webcamVideoRef, screenVideoRef);

       setActiveSession(null); setLatestAnalysis(null); setElapsedTime(0);

        try {
           await authAxios.post(`/api/sessions/${sessionIdToStop}/stop`);
           console.log("Backend session stopped.");
           // Optionally refetch stats here if needed for immediate update
        } catch (err) {
            console.error("Error calling backend stop API:", err);
            setError(`Stop failed (API): ${err.response?.data?.message || err.message}`);
        } finally {
            setLoadingAction(false);
        }
    }, [activeSession, authAxios]); // Doesn't directly depend on handleLogout or state setters


   // --- Capture and Send Function ---
    const captureAndSend = useCallback(async (sessionId) => {
        if (!isSessionRunningRef.current) { console.log(`Capture/Send: Aborted - Running Ref False`); return; }
        if (!activeSession || activeSession._id !== sessionId) { console.warn(`Capture/Send: Aborted - State Mismatch`); return; }
        if (!canvasRef.current || !webcamVideoRef.current || !screenVideoRef.current ||
             !webcamVideoRef.current.srcObject || !screenVideoRef.current.srcObject ||
              webcamVideoRef.current.readyState < 2 || screenVideoRef.current.readyState < 2) {
             console.warn("Capture/Send: Aborted - Prerequisites fail"); return; }

         console.log(`CaptureAndSend: Capturing for ${sessionId}`);
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');

        try {
             ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle="#eee"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(webcamVideoRef.current, 0, 0, WEBCAM_DRAW_WIDTH, CANVAS_HEIGHT);
            ctx.drawImage(screenVideoRef.current, WEBCAM_DRAW_WIDTH, 0, SCREEN_DRAW_WIDTH, CANVAS_HEIGHT);
             const imageFormatToUse = 'image/jpeg'; const quality = 1.0; // Use 1.0 for max JPEG
             const combinedImageUri = canvas.toDataURL(imageFormatToUse, quality);

             // Optional Debug Download
            if (NODE_ENV === 'development') { /* ... downloadDataUri logic ... */ }

            console.log(`Sending combined image to backend...`);
             const response = await authAxios.post(`/api/sessions/data/${sessionId}`, { combinedImageUri });
             console.log("Backend Analysis:", response.data.analysis);
            setLatestAnalysis(response.data.analysis); setError(null);
        } catch (error) {
            console.error("Capture/Send Error:", error);
             // Don't set error for expected rate limiting
            if (error.response?.status === 401) { handleLogout(); }
            else if (error.response?.status === 404) { handleStopSession(); } // Need stable handleStopSession
             else if (error.response?.status !== 429) { // Set error for others except 429
                setError(`Capture Error: ${error.response?.data?.message || error.message}`);
                setLatestAnalysis(null);
             } else {
                console.warn(`Rate limited by backend (429).`);
            }
        }
    }, [activeSession, handleLogout, handleStopSession]); // Dependencies: state, and handlers called inside


   // --- Start Session Handler ---
    const handleStartSession = useCallback(async () => {
        setError(null); setLatestAnalysis(null); setElapsedTime(0);
        if (activeSession) { console.warn("Start: Session already active."); return; }

        // Call global stop function passing refs AND setters
        stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef, setWebcamStream, setScreenStream, webcamVideoRef, screenVideoRef);

        setLoadingAction(true);
        let wStream = null, sStream = null;
        try {
            wStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            sStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
            webcamStreamRef.current = wStream; screenStreamRef.current = sStream;
            if (webcamVideoRef.current) webcamVideoRef.current.srcObject = wStream;
            if (screenVideoRef.current) screenVideoRef.current.srcObject = sStream;
             await Promise.all([webcamVideoRef.current?.play(), screenVideoRef.current?.play()]).catch(e=>console.warn(e));

             const response = await authAxios.post('/api/sessions/start');
             const newSessionId = response.data.sessionId;

             // SET STATE & FLAG LAST
              isSessionRunningRef.current = true;
             setWebcamStream(wStream); // Trigger effect
             setScreenStream(sStream); // Trigger effect
             setActiveSession({ _id: newSessionId, startTime: new Date().toISOString() }); // Trigger effects
             console.log("Start Session: Session Running Ref set to TRUE");
         } catch (err) {
             console.error("Start Session Error:", err);
             setError(`Start Failed: ${err.message}`);
              stopMediaStreamsGlobal(webcamStreamRef, screenStreamRef, setWebcamStream, setScreenStream, webcamVideoRef, screenVideoRef);
              isSessionRunningRef.current = false;
             setActiveSession(null); // Ensure reset
         } finally { setLoadingAction(false); }
    }, [activeSession, authAxios]); // Depends on state setters implicitly, but OK


   // --- Capture Interval useEffect ---
    useEffect(() => {
        console.log(`Capture Interval Effect Check: session=${activeSession?._id}, webcam=${!!webcamStream}, screen=${!!screenStream}, runningRef=${isSessionRunningRef.current}`);
        if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }

         if (activeSession?._id && webcamStream && screenStream && isSessionRunningRef.current) {
            console.log(`+++ Starting Capture Interval for ${activeSession._id}`);
             const currentSessionId = activeSession._id;
             const intervalCallback = () => {
                console.log("--- Capture Interval Fired ---");
                captureAndSend(currentSessionId);
             };
             intervalCallback(); // Initial fire
             captureIntervalRef.current = setInterval(intervalCallback, ANALYSIS_INTERVAL_MS);
             console.log(`+++ Capture Interval ID ${captureIntervalRef.current} set.`);
         } else { console.log("--- Capture Interval: Conditions NOT met."); }

        return () => { /* ... Cleanup clears captureIntervalRef.current ... */ };
    // Dependencies that determine *if the interval should run*
    // captureAndSend removed -> relying on the ref flag inside it
    }, [activeSession, webcamStream, screenStream]);

    // --- Elapsed Timer useEffect ---
    useEffect(() => {
        console.log(`Elapsed Timer Effect Check: session=${activeSession?._id}`);
         if (elapsedTimerIntervalRef.current) { clearInterval(elapsedTimerIntervalRef.current); elapsedTimerIntervalRef.current = null; }

        if (activeSession && isSessionRunningRef.current) { // Also check if session is supposed to be running
             console.log(`+++ Starting Elapsed Timer for ${activeSession._id}`);
             const startTime = activeSession.startTime ? new Date(activeSession.startTime) : new Date();
            const calculateElapsedTime = () => {
                 // Check flag inside too, in case stop happens between intervals
                 if (!isSessionRunningRef.current) {
                      if (elapsedTimerIntervalRef.current) clearInterval(elapsedTimerIntervalRef.current);
                      elapsedTimerIntervalRef.current = null;
                     return;
                  }
                 const now = new Date();
                 const seconds = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
                setElapsedTime(seconds);
             };
            calculateElapsedTime();
            elapsedTimerIntervalRef.current = setInterval(calculateElapsedTime, 1000);
             console.log(`+++ Elapsed Timer ID ${elapsedTimerIntervalRef.current} set.`);
        } else {
             setElapsedTime(0); // Reset if no active/running session
         }

        return () => { /* ... Cleanup clears elapsedTimerIntervalRef.current ... */ };
    }, [activeSession]); // Depends only on activeSession existence


   // --- Helper function ---
    const formatElapsedTime = (totalSeconds) => {
        if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

   // --- Rendering ---
    if (loadingData) return <div style={{padding: '20px'}}>Loading Dashboard...</div>;
    if (!user) return <div style={{padding: '20px'}}>Error: Please <Link to="/login">Login</Link>.</div>;


    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
         {/* Header */}
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
           <h1>Focus Guardian</h1>
           <span>Welcome, {user?.name || user?.email}!</span>
           <button onClick={handleLogout} disabled={loadingAction} style={{ padding: '8px 12px' }}>Logout</button>
        </div>

         {error && <p style={{ color: '#D8000C', backgroundColor: '#FFD2D2', border: '1px solid #D8000C', padding: '10px', marginBottom: '15px', borderRadius: '5px' }}>Error: {error}</p>}

         {/* Session Control & Status */}
        <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '15px', marginBottom: '20px', backgroundColor: activeSession ? '#e9fdee' : '#fff' }}>
           <h2>Session Status</h2>
           {!activeSession ? (
             <> <p>No active session.</p> <button onClick={handleStartSession} disabled={loadingAction} style={{ /*...*/ }}>{loadingAction ? 'Starting...' : 'Start New Focus Session'}</button> </>
           ) : (
             <>
                <p style={{ color: 'green', fontWeight: 'bold' }}>Session Active (ID: ...{activeSession._id.slice(-6)})</p>
                 <p>Started: {new Date(activeSession.startTime).toLocaleString()}</p>
                <p style={{ fontSize: '1.8em', fontWeight: 'bold', margin: '15px 0', color: '#333' }}>
                  {formatElapsedTime(elapsedTime)} {/* Display Timer */}
                 </p>
                 <button onClick={handleStopSession} disabled={loadingAction} style={{ /*...*/ }}>{loadingAction ? 'Stopping...' : 'Stop Session'}</button>
                <div style={{marginTop: '10px', fontSize: '0.9em'}}>
                   {webcamStream && <span style={{ color: 'green', marginRight: '15px' }}>✔️ Webcam Ready</span>}
                    {screenStream && <span style={{ color: 'green' }}>✔️ Screen Sharing Ready</span>}
                 </div>
             </>
           )}
         </div>

        {/* Display Latest Analysis */}
         {activeSession && (
            <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', marginBottom: '20px', backgroundColor: '#f8f9fa' }}>
               <h3>Latest Analysis (Updates ~every 120s)</h3>
               {latestAnalysis ? ( <pre> {JSON.stringify(latestAnalysis, null, 2)} </pre> )
                : error && !error.startsWith("Stop failed") ? ( <p style={{ color: 'orange' }}>Analysis Error.</p> )
                : ( <p>Waiting for first analysis data...</p> )}
             </div>
         )}


         {/* Stats/Charts Placeholder */}
         <div style={{ border: '1px solid #eee', padding: '15px', marginTop: '20px', borderRadius: '8px' }}>
            <h2>Statistics & Analytics</h2>
            <p><em>(Overall Stats / Session History / Charts implementation goes here)</em></p>
            {/* Example: You would fetch stats/history in the initial useEffect and render specific components here passing that data */}
             {/* <OverallStats stats={stats} /> */}
            {/* <SessionHistoryList history={sessionHistory} /> */}
         </div>

         {/* Hidden Elements */}
         <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', top: '-9999px', left: '-9999px', opacity: 0}}>
            <video ref={webcamVideoRef} playsInline autoPlay muted width={WEBCAM_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
            <video ref={screenVideoRef} playsInline autoPlay muted width={SCREEN_DRAW_WIDTH} height={CANVAS_HEIGHT}></video>
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}></canvas>
         </div>
      </div>
   );
}

export default DashboardPage;