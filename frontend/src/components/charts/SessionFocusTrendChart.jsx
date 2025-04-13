import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

function SessionFocusTrendChart({ history, options }) {
    const chartData = useMemo(() => {
        if (!history || history.length === 0) return { labels: [], datasets: [] };
        const validHistory = history.filter(s => s.startTime).reverse();
        return {
            labels: validHistory.map(s => new Date(s.startTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
            datasets: [{
                label: 'Focus % per Session',
                data: validHistory.map(s => {
                   const total = (s.focusTime || 0) + (s.distractionTime || 0);
                   return total === 0 ? 0 : Math.round(((s.focusTime || 0) / total) * 100);
                }),
                borderColor: 'rgb(255, 159, 64)',
                backgroundColor: 'rgba(255, 159, 64, 0.1)',
                tension: 0.1,
                fill: true // Requires Filler plugin registered
            }]
        };
    }, [history]);

     const hasData = chartData.labels.length > 0;

    return (
         <div style={styles.container}>
             <h3 style={styles.title}>Focus % Per Session</h3>
             <div style={{ ...styles.chartWrapper, height: '280px' }}>
                 {hasData ? (
                     <Line options={options} data={chartData} />
                 ) : (
                     <p style={styles.noDataText}>No data available.</p>
                 )}
             </div>
         </div>
     );
}
const styles = { /* ... styles ... */ };
export default SessionFocusTrendChart;