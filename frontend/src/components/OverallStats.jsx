// src/components/OverallStats.jsx
import React from 'react';
// We'll import chart components later

function OverallStats({ stats }) { // Receives aggregate stats as a prop
  if (!stats) {
    return <div>Loading overall stats...</div>;
  }

   // Helper to format time
   const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '0 min';
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <div style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px' }}>
      <h2>Overall Statistics</h2>
      <p>Total Focus Time: <strong>{formatTime(stats.totalFocusTime)}</strong></p>
      <p>Total Distraction Time: <strong>{formatTime(stats.totalDistractionTime)}</strong></p>
      <div style={{ marginTop: '20px' }}>
        <h3>App Usage (Pie Chart Placeholder)</h3>
         {/* Pie chart component will go here, using stats.appUsage */}
         <p>App Usage Pie Chart will be displayed here.</p>
      </div>
      <div style={{ marginTop: '20px' }}>
        <h3>Focus vs Distraction (Pie Chart Placeholder)</h3>
        {/* Another Pie chart for focus/distraction totals */}
         <p>Focus/Distraction Pie Chart will be displayed here.</p>
       </div>
    </div>
  );
}

export default OverallStats;