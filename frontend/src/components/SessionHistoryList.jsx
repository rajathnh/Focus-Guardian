// src/components/SessionHistoryList.jsx
import React from 'react';

function SessionHistoryList({ history }) { // Receives history array as prop
   // Helper to format time duration
   const formatDuration = (start, end) => {
       if (!end) return "In progress";
       const durationMs = new Date(end) - new Date(start);
        if (isNaN(durationMs) || durationMs < 0) return "N/A";
        const minutes = Math.round(durationMs / 60000);
        return `${minutes} min`;
   };

    // Helper to format focus percentage
   const formatFocusPercent = (focusTime, distractionTime) => {
       const total = (focusTime || 0) + (distractionTime || 0);
        if (total === 0) return "0%";
        const percent = Math.round(((focusTime || 0) / total) * 100);
        return `${percent}%`;
   };


  return (
    <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px' }}>
      <h2>Recent Sessions</h2>
      {(!history || history.length === 0) ? (
        <p>No session history found.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
          {history.slice(0, 10).map((session) => ( // Show latest 10
            <li key={session._id} style={{ borderBottom: '1px solid #f0f0f0', padding: '10px 0' }}>
              <strong>Started:</strong> {new Date(session.startTime).toLocaleString()} <br />
              <strong>Duration:</strong> {formatDuration(session.startTime, session.endTime)} <br />
              <strong>Focus:</strong> {formatFocusPercent(session.focusTime, session.distractionTime)} ({formatTime(session.focusTime)})
              {/* Add more details like top app from session.appUsage later */}
             </li>
          ))}
        </ul>
      )}
       <div style={{ marginTop: '20px' }}>
            <h3>Daily/Weekly Trend (Chart Placeholder)</h3>
            <p>Chart showing focus over time will go here.</p>
        </div>
    </div>
  );
   // Inner helper for simple minute formatting
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0 min';
        const minutes = Math.round(seconds / 60);
        return `${minutes} min`;
    }
}

export default SessionHistoryList;