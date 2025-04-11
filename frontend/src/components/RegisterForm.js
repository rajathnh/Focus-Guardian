// src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios'; // For making API calls
import { useNavigate } from 'react-router-dom'; // For redirecting user

// --- Helper to create Axios instance with Auth Token ---
// This ensures the token is attached to requests made from this component
const createAuthAxios = () => {
  const instance = axios.create();
  // Get the token from wherever you store it (localStorage is common)
  const token = localStorage.getItem('focusGuardianToken');
  if (token) {
    // Set the Authorization header for all requests made with this instance
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    // Optionally handle the case where the token doesn't exist (e.g., log a warning)
    console.warn("Auth token not found in localStorage for Axios instance.");
  }
  return instance;
};
// --- End Helper ---


function DashboardPage() {
  const navigate = useNavigate(); // Hook for programmatic navigation

  // --- State Variables ---
  const [user, setUser] = useState(null); // Holds user data (name, email etc.)
  const [stats, setStats] = useState(null); // Holds aggregate stats (focus time, app usage)
  const [sessionHistory, setSessionHistory] = useState([]); // Optional: For displaying past sessions
  const [activeSession, setActiveSession] = useState(null); // Holds details of the currently running session, if any
  const [loading, setLoading] = useState(true); // Indicates initial data loading
  const [error, setError] = useState(null); // Stores error messages

  const authAxios = createAuthAxios(); // Create an authenticated Axios instance

  // --- Data Fetching on Component Mount ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('focusGuardianToken'); // Explicitly check token here

      // If no token, redirect to login immediately
      if (!token) {
        console.log("No token found, redirecting...");
        navigate('/login');
        return; // Stop execution
      }

      try {
        // Use Promise.all to fetch necessary data concurrently
        const [profileRes, statsRes, currentSessionRes, historyRes] = await Promise.all([
          authAxios.get('/api/users/profile').catch(handleFetchError), // Fetch user profile
          authAxios.get('/api/sessions/stats').catch(handleFetchError), // Fetch aggregate stats
          authAxios.get('/api/sessions/current').catch(handleFetchError), // Check for active session
          authAxios.get('/api/sessions/history').catch(handleFetchError) // Optional: fetch session history
        ]);

        // Process responses (check if fetch was successful)
        if (profileRes && profileRes.data) {
          setUser(profileRes.data);
        } else {
           // Profile fetch failed - might be critical
           throw new Error("Failed to load user profile.");
        }

        if (statsRes && statsRes.data) {
          setStats(statsRes.data);
        } // Stats failing might be less critical than profile

        // For current session, 404 is expected if none is active
        if (currentSessionRes && currentSessionRes.status === 200 && currentSessionRes.data) {
           setActiveSession(currentSessionRes.data);
        } else {
            setActiveSession(null); // Ensure it's null if fetch fails or returns 404/null data
        }

         if (historyRes && historyRes.data) {
             setSessionHistory(historyRes.data);
         }

      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError(err.message || "Failed to load dashboard. Please try logging in again.");
        // Handle specific errors like 401 Unauthorized (invalid token)
        if (err.response?.status === 401) {
          handleLogout(); // Log out user if token is bad
        }
      } finally {
        setLoading(false); // Finish loading sequence
      }
    };

    // Helper to handle errors within Promise.all without stopping others
     const handleFetchError = (error) => {
         if (error.response?.status === 404 && error.config.url.includes('/api/sessions/current')) {
            return { status: 404, data: null }; // Treat 404 for current session as valid (no active session)
        }
         console.error(`Fetch Error (${error.config?.url}):`, error);
         if (error.response?.status === 401) {
             throw error; // Re-throw 401 to be caught by main try-catch
        }
         return null; // Return null for other errors so Promise.all completes
    };

    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means run only once on mount


  // --- Event Handlers ---
  const handleLogout = () => {
    localStorage.removeItem('focusGuardianToken');
    localStorage.removeItem('focusGuardianUser'); // Clear stored user too if you stored it
    navigate('/login'); // Redirect to login page
  };

  const handleStartSession = async () => {
    setError(null);
    if (activeSession) {
      setError("A session is already active. Stop the current session first.");
      return;
    }
    try {
      setLoading(true); // Show loading state while starting
      const response = await authAxios.post('/api/sessions/start');
      // Update state with the new active session immediately
      setActiveSession({
        _id: response.data.sessionId,
        startTime: new Date().toISOString() // Set current time or use value from response if available
      });
      console.log("Session started:", response.data.sessionId);
      alert("Session started successfully!"); // Replace with better UI feedback
      // Maybe navigate to a dedicated session monitoring page?
      // navigate(`/session/${response.data.sessionId}`);
      // Or start the image capture/send loop here directly if Dashboard stays active
    } catch (err) {
      console.error("Error starting session:", err);
      setError(err.response?.data?.message || "Failed to start session.");
    } finally {
       setLoading(false);
    }
  };

  const handleStopSession = async () => {
    setError(null);
    if (!activeSession || !activeSession._id) {
      setError("No active session to stop.");
      return;
    }
    try {
        setLoading(true); // Show loading state while stopping
      await authAxios.post(`/api/sessions/${activeSession._id}/stop`);
      setActiveSession(null); // Clear the active session state
       console.log("Session stopped.");
       alert("Session stopped successfully!"); // Replace with better UI feedback
       // Re-fetch stats/history to show updated data after stopping
      // You might want a more targeted update than fetching everything again
      setStats(null); // Clear current stats to show loading state for stats
      setSessionHistory([]); // Clear history
       // Trigger a re-fetch (can create a separate function if needed)
       const statsRes = await authAxios.get('/api/sessions/stats').catch(err => {console.error(err); return null;});
       const historyRes = await authAxios.get('/api/sessions/history').catch(err => {console.error(err); return null;});
       if (statsRes?.data) setStats(statsRes.data);
       if (historyRes?.data) setSessionHistory(historyRes.data);

    } catch (err) {
      console.error("Error stopping session:", err);
      setError(err.response?.data?.message || "Failed to stop session.");
    } finally {
        setLoading(false);
    }
  };


  // --- Render Logic ---
  if (loading && !user) {
    // Show loading indicator only during the initial load check
    return <div>Loading dashboard...</div>;
  }

  if (!user && !loading) {
     // Should have been redirected by useEffect, but good failsafe
     return <div>Error: User data not available. Please <button onClick={handleLogout}>Login</button>.</div>
  }

   // Format time in seconds to minutes or hh:mm:ss
  const formatTime = (seconds) => {
       if (isNaN(seconds) || seconds < 0) return '0 min';
      const minutes = Math.round(seconds / 60);
       return `${minutes} min`;
      // Or for hh:mm:ss:
      // const h = Math.floor(seconds / 3600);
      // const m = Math.floor((seconds % 3600) / 60);
      // const s = Math.floor(seconds % 60);
      // return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };


  return (
    <div>
      {/* Basic Header/Navbar structure within the page */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <h1>Focus Dashboard</h1>
         {user && <span>Welcome, {user.name || user.email}!</span>}
        <button onClick={handleLogout}>Logout</button>
      </div>

      {error && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '15px' }}>Error: {error}</p>}

      {/* Session Controls Area */}
      <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px' }}>
        <h2>Session Control</h2>
        {loading && (activeSession === null || activeSession === undefined) && <p>Checking session status...</p>}
        {!loading && activeSession ? (
          <div>
            <p style={{ color: 'green', fontWeight: 'bold' }}>Session currently active!</p>
            <p>Started: {new Date(activeSession.startTime).toLocaleString()}</p>
             {/* Display live timer here eventually */}
            <button onClick={handleStopSession} disabled={loading}>
                {loading ? 'Stopping...' : 'Stop Current Session'}
            </button>
          </div>
        ) : (
          <div>
             <p>No active session.</p>
            <button onClick={handleStartSession} disabled={loading || activeSession !== null}>
                {loading ? 'Starting...' : 'Start New Focus Session'}
            </button>
          </div>
        )}
         {/* Placeholder for capture logic/feedback */}
        {activeSession && <p><em>(Capture logic would run here if implemented on this page)</em></p>}
      </div>


      {/* Aggregate Stats Area */}
       <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px' }}>
         <h2>Overall Stats</h2>
        {!stats && loading && <p>Loading stats...</p> }
         {stats && !loading ? (
           <>
            <p>Total Focus Time: <strong>{formatTime(stats.totalFocusTime)}</strong></p>
            <p>Total Distraction Time: <strong>{formatTime(stats.totalDistractionTime)}</strong></p>
             <h3>Top App Usage (Total Time):</h3>
             {stats.appUsage && Object.keys(stats.appUsage).length > 0 ? (
                // Simple list for now, can be a chart later
                <ul style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {Object.entries(stats.appUsage)
                      .sort(([, timeA], [, timeB]) => timeB - timeA) // Sort descending by time
                      .slice(0, 10) // Show top 10
                      .map(([appName, time]) => (
                         <li key={appName}>{appName}: {formatTime(time)}</li>
                    ))}
                 </ul>
             ) : (
                 <p>No application usage data recorded yet.</p>
            )}
           </>
        ) : (
            !loading && <p>Could not load stats.</p>
        )}
       </div>

       {/* Placeholder for more detailed views/charts */}
      <div style={{ marginTop: '30px' }}>
         <h2>Analytics (Future Implementation)</h2>
        <p>Charts displaying focus trends over time, session history details, and distraction patterns will be added here.</p>
         {/* Could show sessionHistory data here */}
         {/* <SessionHistoryList history={sessionHistory} /> */}
      </div>

    </div>
  );
}

export default DashboardPage;