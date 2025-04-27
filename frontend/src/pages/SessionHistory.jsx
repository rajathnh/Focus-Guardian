// src/pages/SessionHistoryPage.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './sessionhistory.css';



// --- Import Specific Chart Components ---
// Ensure these paths and filenames (case-sensitive!) are correct for your project
import DailyFocusTimeChart from '../components/charts/DailyFocusTimeChart';
import DailyFocusPercentChart from '../components/charts/DailyFocusPercentChart';
import SessionFocusTrendChart from '../components/charts/SessionFocusTrendChart';
import SessionDurationChart from '../components/charts/SessionDurationChart';
import AppUsagePieChart from '../components/charts/AppUsagePieChart'; // For inline session details
import DailyAppUsagePieChart from '../components/charts/DailyAppUsagePieChart'; // For the top daily section
const API_URL = process.env.REACT_APP_API_BASE_URL;
// --- Axios Helper ---
const createAuthAxiosInstance = () => {
    // console.log("SessionHistory: Creating Auth Axios Instance...");
    const instance = axios.create({ /* baseURL if needed */ });
    const token = localStorage.getItem('focusGuardianToken');
    if (token) {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("SessionHistory: Token missing.");
    }
    return instance;
};
const authAxios = createAuthAxiosInstance();

// --- Formatting Helpers (Implementations Included) ---
const formatDuration = (start, end, units = 'min') => {
    if (!start || !end) return "N/A";
    try {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "Invalid Date";

        const durationMs = endDate.getTime() - startDate.getTime();
        if (isNaN(durationMs) || durationMs < 0) return "N/A";

        if (units === 'min') {
            const minutes = Math.round(durationMs / 60000);
            return `${minutes} min`;
        } else {
            const seconds = Math.round(durationMs / 1000);
            return `${seconds} sec`;
        }
    } catch(e) {
        console.error("Error formatting duration:", start, end, e);
        return "Error";
    }
};

const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

const formatFocusPercent = (focusTime = 0, distractionTime = 0) => {
    const numFocusTime = Number(focusTime) || 0;
    const numDistractionTime = Number(distractionTime) || 0;
    const totalValidTime = numFocusTime + numDistractionTime;
    if (totalValidTime <= 0) return "0%";
    const percent = Math.round((numFocusTime / totalValidTime) * 100);
    return `${percent}%`;
};

const formatTimeDetailed = (seconds = 0) => {
    const validSeconds = Number(seconds) || 0;
    if (isNaN(validSeconds) || validSeconds < 0) return "0m";
    const totalMinutes = Math.round(validSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let result = "";
    if (hours > 0) {
        result += `${hours}h `;
    }
    result += `${minutes}m`;
    return result;
};

const formatMinutesOnly = (seconds = 0) => {
    const validSeconds = Number(seconds) || 0;
    if (isNaN(validSeconds) || validSeconds < 0) return "0m";
     const minutes = Math.round(validSeconds / 60);
     return `${minutes}m`;
};

const formatDateShort = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return "Error";
    }
};

// --- Styles Object (Moved outside component) ---
const styles = {
    thFlex: { padding: '10px 8px', flexBasis: '150px', flexGrow: 1, borderRight: '1px solid #ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' },
    trFlex: { display: 'flex', borderBottom: '1px solid #eee', alignItems: 'stretch', background: '#fff' }, // Use stretch for alignment
    trFlexExpanded: { display: 'flex', borderBottom: 'none', background: '#f8f8ff', alignItems: 'stretch' }, // Use stretch
    tdFlex: { padding: '8px', flexBasis: '150px', flexGrow: 1, borderRight: '1px solid #eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' },
    tdFlexBold: { padding: '8px', flexBasis: '150px', flexGrow: 1, borderRight: '1px solid #eee', fontWeight: 'bold', display: 'flex', alignItems: 'center' },
    tdFlexGreen: { padding: '8px', flexBasis: '150px', flexGrow: 1, borderRight: '1px solid #eee', color: 'green', display: 'flex', alignItems: 'center' },
    tdFlexRed: { padding: '8px', flexBasis: '150px', flexGrow: 1, borderRight: '1px solid #eee', color: 'red', display: 'flex', alignItems: 'center' },
    detailButtonCell: { padding: '8px', flexBasis: '80px', flexGrow: 0, textAlign: 'center', alignItems: 'center', borderRight: 'none', display: 'flex', justifyContent: 'center' }, // Centering button
    detailButton: { padding: 0, cursor: 'pointer', border: '1px solid #ccc', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24px', width: '24px', fontSize: '14px', lineHeight: '1' },
    trDetailDiv: { background: '#f8f8ff', borderBottom: '1px solid #ccc', animation: 'fadeInDetail 0.3s ease-out' },
    detailHeading: { marginTop: 0, textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: '5px', fontWeight: '500', marginBottom: '10px' },
    errorText: { color: 'orange', textAlign: 'center', padding: '20px', gridColumn: '1 / -1' }
};

// --- THE COMPONENT ---
function SessionHistoryPage() {
    const navigate = useNavigate();

    // --- State variables ---
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState(null);
    const [dailyData, setDailyData] = useState([]);
    const [dailyLoading, setDailyLoading] = useState(true);
    const [dailyError, setDailyError] = useState(null);
    const [dailyAppStats, setDailyAppStats] = useState([]);
    const [dailyAppLoading, setDailyAppLoading] = useState(true);
    const [dailyAppError, setDailyAppError] = useState(null);
    const [expandedSessionId, setExpandedSessionId] = useState(null); // ID for inline expansion
    const [expandedSessionData, setExpandedSessionData] = useState(null); // Data for inline expansion
    const [expandedDetailLoading, setExpandedDetailLoading] = useState(false); // Loading for inline expansion
    const [expandedDetailError, setExpandedDetailError] = useState(null); // Error for inline expansion

    const fetchTargetRef = useRef(null);

    // eslint-disable-next-line no-unused-vars
    const [daysToShow, setDaysToShow] = useState(7);

    // --- Handlers ---
    const handleLogout = useCallback(() => {
        localStorage.removeItem('focusGuardianToken');
        localStorage.removeItem('focusGuardianUser');
        setHistory([]);
        setDailyData([]);
        setDailyAppStats([]);
        setExpandedSessionId(null);
        navigate('/login');
    }, [navigate]);

    const fetchSessionHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError(null);
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) { handleLogout(); return; }
        if (!authAxios.defaults.headers.common['Authorization']) { authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`; }
        try {
            const response = await authAxios.get(`${API_URL}/api/sessions/history`);
            // Assuming API returns newest first. If not, sort here.
            setHistory(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            setHistoryError("Could not load session history.");
            if (err.response?.status === 401 || err.response?.status === 403) { handleLogout(); }
        } finally {
            setHistoryLoading(false);
        }
    }, [handleLogout]);

    const fetchDailyData = useCallback(async () => {
        setDailyLoading(true);
        setDailyError(null);
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) { handleLogout(); return; }
        if (!authAxios.defaults.headers.common['Authorization']) { authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`; }
        try {
            const response = await authAxios.get(`${API_URL}/api/sessions/daily?days=${daysToShow}`);
            setDailyData(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            setDailyError("Could not load daily analysis data.");
            if (err.response?.status === 401 || err.response?.status === 403) { handleLogout(); }
        } finally {
            setDailyLoading(false);
        }
    }, [daysToShow, handleLogout]);

    const fetchDailyAppStats = useCallback(async () => {
        setDailyAppLoading(true);
        setDailyAppError(null);
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) { handleLogout(); return; }
        if (!authAxios.defaults.headers.common['Authorization']) { authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`; }
        try {
            const response = await authAxios.get(`${API_URL}/api/sessions/daily/apps?days=${daysToShow}`); // Verify route
            setDailyAppStats(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            setDailyAppError("Could not load daily app usage data.");
            if (err.response?.status === 401 || err.response?.status === 403) { handleLogout(); }
        } finally {
            setDailyAppLoading(false);
        }
    }, [daysToShow, handleLogout]);

    const fetchExpandedSessionDetails = useCallback(async (sessionId) => {
        if (!sessionId) return;
    
        console.log(`fetchExpandedSessionDetails called for session: ${sessionId}. Current expanded: ${expandedSessionId}`); // Log entry
    
        // --- Explicit Toggle Check FIRST ---
        if (sessionId === expandedSessionId) {
            console.log(`Toggle OFF detected for ${sessionId}. Closing.`);
            setExpandedSessionId(null);
            setExpandedSessionData(null);
            setExpandedDetailLoading(false);
            setExpandedDetailError(null);
            fetchTargetRef.current = null;
            return; // Exit immediately
        }
    
        // --- If we reach here, it means we are OPENING a new session (or switching) ---
    
        // Optional check to prevent duplicate fetches for the *same* target
        if (expandedDetailLoading && fetchTargetRef.current === sessionId) {
            console.log(`Fetch already in progress for ${sessionId}, skipping duplicate start.`);
            return;
        }
    
        // Starting NEW expansion
        console.log(`Fetching details for NEW expanded session ID: ${sessionId}`);
        fetchTargetRef.current = sessionId; // Set ref target FIRST
        setExpandedDetailLoading(true);    // Set loading true
        setExpandedDetailError(null);     // Clear previous error
        setExpandedSessionData(null);     // Clear previous data
        setExpandedSessionId(sessionId);   // Set the ID of the session to expand
    
        const token = localStorage.getItem('focusGuardianToken');
        // --- Fill Blank 1: Handle logout ---
        if (!token) {
            console.log("No token found during detail fetch, logging out.");
            setExpandedDetailLoading(false); // Stop loading before logout
            setExpandedSessionId(null);      // Clear expansion target
            fetchTargetRef.current = null;
            handleLogout();
            return;
        }
        // --- Fill Blank 2: Set header ---
        if (!authAxios.defaults.headers.common['Authorization']) {
            console.log("Re-adding auth token for detail fetch.");
            authAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
    
        let success = false;
        let fetchedData = null;
        try {
            const response = await authAxios.get(`${API_URL}/api/sessions/${sessionId}`);
            // Check ref before processing response data
            if (fetchTargetRef.current === sessionId) {
                fetchedData = response.data;
                success = true;
                 console.log(`<<< Successfully fetched data for ${sessionId}`);
            } else {
                console.log(`<<< Fetch completed for ${sessionId}, but target changed. Discarding data.`);
            }
        } catch (err) {
             // Check ref before processing error data
            if (fetchTargetRef.current === sessionId) {
                 console.error(`Error fetching expanded details for target ${sessionId}:`, err);
                 // --- Fill Blank 3: Handle specific errors ---
                 if (err.response?.status === 404) {
                     setExpandedDetailError("Session details not found.");
                 } else if (err.response?.status === 401 || err.response?.status === 403) {
                     setExpandedDetailError("Authentication failed. Logging out..."); // Set error briefly
                     handleLogout(); // Logout will redirect
                     // Clear expansion state immediately as well
                     setExpandedSessionId(null);
                     fetchTargetRef.current = null;
                 } else {
                     setExpandedDetailError("Could not load session details due to server error.");
                 }
                 // Ensure data is cleared on error
                 setExpandedSessionData(null);
            } else {
                console.log(`Error received for ${sessionId}, but target changed. Ignoring error.`);
            }
        } finally {
             // Check ref before setting final state
            if (fetchTargetRef.current === sessionId) {
                console.log(`<<< FINALLY processing result for ${sessionId}, success=${success} >>>`);
                 // --- Fill Blank 4: Set data/error on success ---
                if(success && fetchedData) {
                    setExpandedSessionData(fetchedData);
                    setExpandedDetailError(null); // Clear any previous error on success
                }
                // Stop loading ONLY if we processed this target
                setExpandedDetailLoading(false);
            } else {
                console.log(`<<< FINALLY: Target changed from ${sessionId}. Not updating state.`);
                // Don't touch loading state here - the fetch for the *new* target will handle it
            }
        }
    }, [handleLogout, expandedSessionId, expandedDetailLoading]); // Keep dependencies needed for logic inside
    
    // --- useEffect for initial data fetches ---
    useEffect(() => {
        const token = localStorage.getItem('focusGuardianToken');
        if (!token) {
            handleLogout();
        } else {
             fetchSessionHistory();
             fetchDailyData();
             fetchDailyAppStats();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once


    // --- Chart Options ---
    const commonBarChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' }, tooltip: { mode: 'index', intersect: false } },
        scales: { y: { beginAtZero: true } }
    }), []);
    const percentChartOptions = useMemo(() => ({
        ...commonBarChartOptions,
        scales: { y: { ...commonBarChartOptions.scales.y, min: 0, max: 100 } }
    }), [commonBarChartOptions]);
    const commonLineChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true } }
    }), []);
    const focusPercentLineOptions = useMemo(() => ({
        ...commonLineChartOptions,
        scales: { ...commonLineChartOptions.scales, y: { ...commonLineChartOptions.scales.y, min: 0, max: 100 } }
    }), [commonLineChartOptions]);
    const pieChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 15 } }, // Adjust legend appearance
            tooltip: { callbacks: { label: (context) => `${context.label || ''}: ${context.parsed || 0} min` } },
        }
    }), []);


    // --- Rendering Logic ---
    const isLoading = historyLoading || dailyLoading || dailyAppLoading;
    const displayError = historyError || dailyError || dailyAppError;

    return (
        <div className="session-history-page">
          <Navbar />
          <div className="session-history-container">
    
            {/* Header */}
            <div className="session-history-header">
              <h1>Analytics & History</h1>
              <Link to="/dashboard" className="back-button">← Back to Dashboard</Link>
            </div>
    
            {/* Loading / Error */}
            {isLoading && <div className="loading-indicator">Loading data...</div>}
            {displayError && !isLoading && (
              <div className="loading-error">
                Error loading some data. Charts or logs may be incomplete. Please try refreshing. <Link to="/dashboard">Go Back</Link>.
              </div>
            )}
    
            {/* Main Content */}
            {!isLoading && (
              <>
    
                {/* Daily Analysis */}
                <section className="daily-analysis-section">
                  <h2 className="session-section-heading">Daily Analysis (Last {daysToShow} Days)</h2>
                  <div className="chart-grid">
                    {dailyError
                      ? <div className="loading-error">Focus Time/Percent Chart Error</div>
                      : (
                        <>
                          <div className="chart-item"><DailyFocusTimeChart dailyData={dailyData} options={commonBarChartOptions} formatDateShort={formatDateShort} /></div>
                          <div className="chart-item"><DailyFocusPercentChart dailyData={dailyData} options={percentChartOptions} formatDateShort={formatDateShort} /></div>
                        </>
                      )
                    }
                    {dailyAppError
                      ? <div className="loading-error">Daily App Usage Chart Error</div>
                      : <div className="chart-item full-width"><DailyAppUsagePieChart dailyAppStats={dailyAppStats} options={pieChartOptions} getRandomColor={getRandomColor} /></div>
                    }
                  </div>
                </section>
    
                {/* Per-Session Trends */}
                <section className="session-trends-section">
                  <h2 className="session-section-heading">Per-Session Trends</h2>
                  {historyError
                    ? <div className="loading-error">Trend Chart Error</div>
                    : (
                      <div className="chart-grid">
                        <div className="chart-item"><SessionFocusTrendChart history={history} options={focusPercentLineOptions} /></div>
                        <div className="chart-item"><SessionDurationChart history={history} options={commonBarChartOptions} /></div>
                      </div>
                    )
                  }
                </section>
    
                {/* Detailed Session Log */}
                <section className="detailed-log-section">
                  <h2 className="session-section-heading">Detailed Session Log</h2>
                  {historyError
                    ? <p style={styles.errorText}>Could not load the detailed session log.</p>
                    : history.length === 0
                      ? <p>No sessions recorded yet.</p>
                      : (
                        <div className="table-container">
                          <div className="flex-table">
                            {/* Header Row */}
                            <div className="flex-header">
                              <div className="cell">Start Time</div>
                              <div className="cell">Duration</div>
                              <div className="cell">Focus %</div>
                              <div className="cell">Focus Time</div>
                              <div className="cell">Distraction</div>
                              <div className="cell">Top App</div>
                              <div className="cell actions">Details</div>
                            </div>
                            {/* Data Rows */}
                            {history.map(session => {
                              const isExpanded = expandedSessionId === session._id;
                              const topAppEntry = Object.entries(session.appUsage || {}).sort(([, a], [, b]) => b - a)[0];
                              const topAppName = topAppEntry ? topAppEntry[0].replace(/_/g, '.') : 'N/A';
                              const topAppTime = topAppEntry ? topAppEntry[1] : 0;
    
                              return (
                                <React.Fragment key={session._id}>
                                  <div className={`flex-row${isExpanded ? ' expanded' : ''}`}>
                                    <div className="cell">{new Date(session.startTime).toLocaleString()}</div>
                                    <div className="cell duration">{formatDuration(session.startTime, session.endTime)}</div>
                                    <div className="cell">{formatFocusPercent(session.focusTime, session.distractionTime)}</div>
                                    <div className="cell">{formatTimeDetailed(session.focusTime)}</div>
                                    <div className="cell">{formatTimeDetailed(session.distractionTime)}</div>
                                    <div className="cell">{topAppName !== 'N/A' ? `${topAppName} (${formatMinutesOnly(topAppTime)})` : 'N/A'}</div>
                                    <div className="cell actions">
                                      <button
                                        onClick={() => fetchExpandedSessionDetails(session._id)}
                                        disabled={expandedDetailLoading && expandedSessionId === session._id}
                                        style={styles.detailButton}
                                        title={isExpanded ? "Hide Details" : "Show Details"}
                                      >
                                        {expandedDetailLoading && expandedSessionId === session._id ? '…' : (isExpanded ? '▼' : '▶')}
                                      </button>
                                    </div>
                                  </div>
                                  {isExpanded && (
                                    <div className="detail-row">
                                      {expandedDetailLoading && <p style={{ padding: '15px', textAlign: 'center' }}>Loading details...</p>}
                                      {expandedDetailError && <p style={{ color: 'red', padding: '15px', textAlign: 'center' }}>Error: {expandedDetailError}</p>}
                                      {expandedSessionData && !expandedDetailLoading && !expandedDetailError && (
                                        <div className="detail-content">
                                          <div>
                                            <h4 style={styles.detailHeading}>Summary</h4>
                                            <p><strong>Started:</strong> {new Date(expandedSessionData.startTime).toLocaleString()}</p>
                                            <p><strong>Ended:</strong> {expandedSessionData.endTime ? new Date(expandedSessionData.endTime).toLocaleString() : 'In Progress'}</p>
                                            <p><strong>Duration:</strong> {formatDuration(expandedSessionData.startTime, expandedSessionData.endTime)}</p>
                                            <p><strong>Focus %:</strong> <span style={{ fontWeight: 'bold' }}>{formatFocusPercent(expandedSessionData.focusTime, expandedSessionData.distractionTime)}</span></p>
                                            <p><strong>Focus Time:</strong> <span style={{ color: 'green' }}>{formatTimeDetailed(expandedSessionData.focusTime)}</span></p>
                                            <p><strong>Distraction Time:</strong> <span style={{ color: 'red' }}>{formatTimeDetailed(expandedSessionData.distractionTime)}</span></p>
                                          </div>
                                          <div>
                                            <h4 style={styles.detailHeading}>Application Usage (This Session)</h4>
                                            <AppUsagePieChart
                                              sessionData={expandedSessionData}
                                              options={pieChartOptions}
                                              getRandomColor={getRandomColor}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      )
                  }
                </section>
    
              </>
            )}
    
          </div>
          <Footer />
        </div>
      );
    }

export default SessionHistoryPage;