// src/pages/SessionHistoryPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo for chart data
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2'; // Import chart types
import {
  Chart as ChartJS,
  CategoryScale, // x axis
  LinearScale,  // y axis
  PointElement, // for points on lines
  LineElement,  // for the lines themselves
  BarElement,   // for bar charts
  Title,        // Chart title
  Tooltip,      // Hover tooltips
  Legend,       // Legend display
} from 'chart.js';

// Register Chart.js components you will use
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// --- Axios Helper ---
// Creates an Axios instance and attempts to add the auth token from localStorage
const createAuthAxiosInstance = () => {
    console.log("SessionHistory: Creating Auth Axios Instance...");
    const instance = axios.create();
    const token = localStorage.getItem('focusGuardianToken');
    if (token) {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("SessionHistory: Token missing for Axios instance when creating.");
    }
    return instance;
};
// Create the instance ONCE when the module loads - makes it stable
const authAxios = createAuthAxiosInstance();


// --- Formatting Helpers --- (Move to a utils file later if needed)
const formatDuration = (start, end, units = 'min') => {
    if (!start || !end) return "N/A"; // Ensure start/end exist
    try {
        const durationMs = new Date(end).getTime() - new Date(start).getTime();
        if (isNaN(durationMs) || durationMs < 0) return "N/A";
        if (units === 'min') {
            const minutes = Math.round(durationMs / 60000);
            return `${minutes} min`;
        } else { // seconds
            const seconds = Math.round(durationMs / 1000);
            return `${seconds} sec`;
        }
    } catch(e) {
        console.error("Error formatting duration:", e);
        return "Error";
    }
};

const formatFocusPercent = (focusTime = 0, distractionTime = 0) => {
    const totalValidTime = focusTime + distractionTime;
    if (totalValidTime <= 0 || isNaN(totalValidTime)) return "0%"; // Avoid division by zero/NaN
    const percent = Math.round((focusTime / totalValidTime) * 100);
    return `${percent}%`;
};

const formatTimeShort = (seconds = 0) => {
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
};
// --- End Helpers ---


// --- THE COMPONENT ---
function SessionHistoryPage() {
    const navigate = useNavigate();
    // Use the globally stable authAxios instance

    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Define stable logout reference using useCallback
     const handleLogout = useCallback(() => {
         localStorage.removeItem('focusGuardianToken');
         localStorage.removeItem('focusGuardianUser');
         navigate('/login');
     }, [navigate]); // Only depends on navigate

    // --- useCallback for Fetch Function ---
    const fetchData = useCallback(async () => {
        console.log("SessionHistory: Fetching data...");
        setLoading(true); setError(null);
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) { console.log("SessionHistory: No token, navigating"); navigate('/login'); return; }

        try {
            const response = await authAxios.get('/api/sessions/history');
            console.log("SessionHistory: Received:", response.data?.length ?? 0, "sessions");
            // Ensure data is always an array, even if backend sends null/undefined
             setHistory(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            console.error("Error fetching session history:", err);
            setError("Could not load session history.");
            if (err.response?.status === 401) {
                 handleLogout(); // Call stable logout
             }
        } finally {
            setLoading(false);
        }
     // Stable dependencies
    }, [navigate, handleLogout]); // authAxios is stable as it's outside

    // --- useEffect to Call Fetch ---
    useEffect(() => {
        fetchData();
        // Dependency is the stable fetchData function
    }, [fetchData]);

    // --- Prepare Data for Charts using useMemo ---
    // useMemo prevents recalculating chart data on every render unless 'history' changes

    // Data for "Focus % Over Time" Line Chart
    const focusTrendData = useMemo(() => {
         if (!history || history.length === 0) return { labels: [], datasets: [] }; // Empty structure if no history
         const validHistory = history.filter(s => s.startTime); // Filter sessions without startTime if any
        return {
             // Show Date + Time for potentially multiple sessions per day
            labels: validHistory.map(s => new Date(s.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).reverse(),
             datasets: [{
                 label: 'Focus % per Session',
                 data: validHistory.map(s => {
                    const total = (s.focusTime || 0) + (s.distractionTime || 0);
                    return total === 0 ? 0 : Math.round(((s.focusTime || 0) / total) * 100);
                 }).reverse(),
                 borderColor: 'rgb(75, 192, 192)',
                 backgroundColor: 'rgba(75, 192, 192, 0.1)',
                 tension: 0.1,
                 fill: true // Optional: fill area under line
             }]
        };
    }, [history]);

    // Data for "Session Duration" Bar Chart
    const durationData = useMemo(() => {
         if (!history || history.length === 0) return { labels: [], datasets: [] };
        const validHistory = history.filter(s => s.startTime && s.endTime); // Only use completed sessions
        return {
            labels: validHistory.map(s => new Date(s.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).reverse(),
             datasets: [{
                 label: 'Session Duration (Minutes)',
                 // Calculate duration in minutes
                data: validHistory.map(s => Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)).reverse(),
                backgroundColor: 'rgba(53, 162, 235, 0.6)',
             }]
        };
    }, [history]);

    // Common Chart options
     const commonChartOptions = useMemo(() => ({
         responsive: true,
         maintainAspectRatio: false, // Allow chart to fill container better
         plugins: {
             legend: { display: true, position: 'top' },
             tooltip: { mode: 'index', intersect: false }
         },
         scales: { y: { beginAtZero: true } } // Common Y axis starting at 0
     }), []);


    // --- Rendering ---
    if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Session History...</div>;
    if (error) return <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>Error: {error}. <Link to="/dashboard">Go Back</Link>.</div>;

    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
             <h1>Session History</h1>
            <Link to="/dashboard">← Back to Dashboard</Link>
         </div>


         {/* --- Charts Section --- */}
        {history.length > 0 ? (
             <div style={{ marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                 <div style={{ border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
                     <h3 style={{ marginTop: 0, textAlign: 'center' }}>Focus % Per Session</h3>
                     <div style={{ position: 'relative', height: '250px' }}> {/* Set container height */}
                         <Line options={{...commonChartOptions, scales: { y: { ...commonChartOptions.scales.y, max: 100 }}}} data={focusTrendData} />
                     </div>
                 </div>
                 <div style={{ border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
                      <h3 style={{ marginTop: 0, textAlign: 'center' }}>Session Duration</h3>
                      <div style={{ position: 'relative', height: '250px' }}> {/* Set container height */}
                          <Bar options={{...commonChartOptions, plugins: { title: { display: false } } }} data={durationData} />
                     </div>
                  </div>
              </div>
          ) : (
               <p>No sessions recorded yet to display charts.</p>
           )}


         {/* --- Session List Section --- */}
         <h2>Detailed Log</h2>
         {history.length === 0 ? (
           <p>No sessions recorded yet.</p>
         ) : (
            // Simple table for better alignment
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead>
               <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
                 <th style={{ padding: '8px' }}>Start Time</th>
                 <th style={{ padding: '8px' }}>Duration</th>
                 <th style={{ padding: '8px' }}>Focus %</th>
                 <th style={{ padding: '8px' }}>Focus Time</th>
                 <th style={{ padding: '8px' }}>Distraction Time</th>
                 <th style={{ padding: '8px' }}>Top App</th>
               </tr>
             </thead>
             <tbody>
              {history.map((session) => {
                 const topAppKey = Object.entries(session.appUsage || {}).sort(([,a],[,b]) => b-a)[0]?.[0];
                 const topAppName = topAppKey ? topAppKey.replace(/_/g, '.') : 'N/A'; // De-sanitize for display

                 return (
                    <tr key={session._id} style={{ borderBottom: '1px solid #eee' }}>
                       <td style={{ padding: '8px' }}>{new Date(session.startTime).toLocaleString()}</td>
                       <td style={{ padding: '8px' }}>{formatDuration(session.startTime, session.endTime)}</td>
                       <td style={{ padding: '8px' }}>{formatFocusPercent(session.focusTime, session.distractionTime)}</td>
                       <td style={{ padding: '8px' }}>{formatTimeShort(session.focusTime || 0)}</td>
                       <td style={{ padding: '8px' }}>{formatTimeShort(session.distractionTime || 0)}</td>
                       <td style={{ padding: '8px' }}>{topAppName}</td>
                    </tr>
                  );
                })}
             </tbody>
           </table>
          )}
       </div>
   );
}

export default SessionHistoryPage;