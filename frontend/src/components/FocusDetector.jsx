// frontend/src/components/FocusDetector.jsx
import React, { useRef, useEffect, useCallback } from 'react'; // Removed unused useState

// --- Configuration ---
const EYE_AR_THRESH = 0.23; // ADJUST THIS
const EYE_AR_CONSEC_FRAMES = 3; // ADJUST THIS

const FocusDetector = ({ isRunning, currentSessionId, authToken, onStatusUpdate }) => {
    const videoRef = useRef(null);
    const faceMeshRef = useRef(null);
    const requestRef = useRef(null);
    const eyeClosureCounterRef = useRef(0);
    const lastSentStatusRef = useRef(null);
    const lastUpdateTimeRef = useRef(null);
    const lastReportedStatusRef = useRef(null);

    // --- Function to Send Data to Backend ---
    const sendFocusStatusToBackend = useCallback(async (focusedState, reasonText, durationSeconds) => {
        if (!currentSessionId || !authToken) { console.warn("[FD Send] Missing ID/Auth"); return; }
        try {
            const API_URL = process.env.REACT_APP_API_BASE_URL || '';
            const response = await fetch(`${API_URL}/api/sessions/focus/${currentSessionId}`, { /* ... fetch options ... */
                 method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                 body: JSON.stringify({ isFocused: focusedState, reason: reasonText, duration: durationSeconds })
             });
            if (!response.ok) { const errorData = await response.json().catch(() => ({})); console.error("[FD Send] Backend Err:", response.status, errorData); }
        } catch (err) { console.error("[FD Send] Network Err:", err); }
    }, [currentSessionId, authToken]);

    // --- Process Results Callback ---
    const onResults = useCallback((results) => {
        if (!isRunning) return;
        let calculatedFocused = true; let calculatedReason = '';
        if (!videoRef.current || !videoRef.current.videoWidth) { return; }
        const imageWidth = videoRef.current.videoWidth; const imageHeight = videoRef.current.videoHeight;

        if (results.multiFaceLandmarks?.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            const calculateEarJS = (eyeIndices) => { /* ... EAR calculation logic ... */
                 if (!eyeIndices.every(index => landmarks?.[index])) return null;
                 try { const coords = eyeIndices.map(i => ({ x: landmarks[i].x * imageWidth, y: landmarks[i].y * imageHeight })); const dist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2); const A = dist(coords[1], coords[5]); const B = dist(coords[2], coords[4]); const C = dist(coords[0], coords[3]); return (C === 0 || isNaN(C)) ? 0.3 : (A + B) / (2.0 * C); } catch (e) { console.error("[FD Results] EAR calc Err", e); return null; }
             };
            const leftEyeIndices = [362, 382, 381, 380, 374, 373]; const rightEyeIndices = [33, 7, 163, 144, 145, 153];
            const leftEar = calculateEarJS(leftEyeIndices); const rightEar = calculateEarJS(rightEyeIndices);
            const earAvg = (leftEar !== null && rightEar !== null && !isNaN(leftEar) && !isNaN(rightEar)) ? (leftEar + rightEar) / 2.0 : null;
            console.log(`[FD Results] EAR Avg: ${earAvg?.toFixed(3)}`); // Keep logging EAR

            if (earAvg !== null && !isNaN(earAvg)) {
                if (earAvg < EYE_AR_THRESH) { eyeClosureCounterRef.current += 1; } else { eyeClosureCounterRef.current = 0; }
                if (eyeClosureCounterRef.current >= EYE_AR_CONSEC_FRAMES) { calculatedFocused = false; if (!calculatedReason.includes("Eyes")) calculatedReason += "Eyes Closed "; }
            } else { eyeClosureCounterRef.current = 0; }
        } else { calculatedFocused = false; calculatedReason = 'No Face Detected'; eyeClosureCounterRef.current = 0; }

        // Compare with last reported status BEFORE calling parent update
        const currentStatus = { focused: calculatedFocused, reason: calculatedReason.trim() };
        const lastStatus = lastReportedStatusRef.current;
        if (!lastStatus || lastStatus.focused !== currentStatus.focused || lastStatus.reason !== currentStatus.reason) {
            // console.log("[FD Update] Status changed, calling onStatusUpdate:", currentStatus); // Reduce noise
            if (onStatusUpdate) { onStatusUpdate(currentStatus); } // Check if prop exists
            lastReportedStatusRef.current = currentStatus;
        }

        // Send Status to Backend (based on time or change in focus boolean)
        const now = Date.now(); const timeSinceLastUpdate = now - (lastUpdateTimeRef.current || now);
        const statusChangedForBackend = lastSentStatusRef.current !== calculatedFocused;
        if (statusChangedForBackend || timeSinceLastUpdate > 10000) {
            sendFocusStatusToBackend(calculatedFocused, calculatedReason.trim(), timeSinceLastUpdate / 1000.0);
            lastSentStatusRef.current = calculatedFocused; lastUpdateTimeRef.current = now;
        }
    }, [isRunning, sendFocusStatusToBackend, onStatusUpdate]); // Keep dependencies

    // --- Initialize MediaPipe ---
    useEffect(() => {
        console.log("[FD Init] Effect running...");
        // Use window.FaceMesh from CDN script
        if (typeof window.FaceMesh !== 'function') {
            console.error("[FD Init] window.FaceMesh not loaded!"); return;
        }
        let instance = null;
        try {
            instance = new window.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
            instance.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            instance.onResults(onResults);
            faceMeshRef.current = instance;
            console.log("[FD Init] Success.");
        } catch (error) { console.error("[FD Init] CRITICAL ERROR:", error); alert("Failed to init detector."); }
        return () => { console.log("[FD Init] Cleanup."); instance = faceMeshRef.current || instance; instance?.close().catch(e => console.error("Error closing:", e)); faceMeshRef.current = null; };
    }, [onResults]);

    // --- Handle Webcam Start/Stop ---
    useEffect(() => {
        const detectionLoop = async () => { /* ... loop logic ... */
            if (!isRunning || !faceMeshRef.current || !videoRef.current || videoRef.current.readyState < 3) { requestRef.current = null; return; }
            try { if (faceMeshRef.current) { await faceMeshRef.current.send({ image: videoRef.current }); } requestRef.current = requestAnimationFrame(detectionLoop); }
            catch(error) { console.error("[FD Loop] Err:", error); requestRef.current = requestAnimationFrame(detectionLoop); }
        };
        const startWebcam = async () => { /* ... start webcam logic ... */
            lastUpdateTimeRef.current = Date.now(); lastReportedStatusRef.current = null; lastSentStatusRef.current = null; eyeClosureCounterRef.current = 0;
            if (!navigator.mediaDevices?.getUserMedia) { alert("Webcam not supported."); return; }
            try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => { videoRef.current.play().then(() => { if (isRunning && faceMeshRef.current && requestRef.current === null) { requestRef.current = requestAnimationFrame(detectionLoop); } }).catch(e => console.error("Vid play Err:", e)); }; } else { stream.getTracks().forEach(t => t.stop()); } }
            catch (err) { console.error("Webcam Access Err:", err.name, err.message); /* ... alert logic ... */ }
         };
        const stopWebcam = () => { /* ... stop webcam logic ... */
             if (requestRef.current) { cancelAnimationFrame(requestRef.current); requestRef.current = null; }
             if (videoRef.current?.srcObject) { videoRef.current.srcObject.getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
         };
        if (isRunning) { startWebcam(); } else { stopWebcam(); }
        return () => { stopWebcam(); };
    }, [isRunning, onResults]);

    // --- Render ---
    return ( <div> <video ref={videoRef} style={{ position: 'absolute', top: '-9999px', left: '-9999px' }} width="640" height="480" autoPlay playsInline muted ></video> </div> );
};

export default FocusDetector;```