import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

function SessionDurationChart({ history, options }) {
    const chartData = useMemo(() => {
        if (!history || history.length === 0) return { labels: [], datasets: [] };
        const validHistory = history.filter(s => s.startTime && s.endTime).reverse();
        return {
            labels: validHistory.map(s => new Date(s.startTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
            datasets: [{
                label: 'Session Duration (Minutes)',
               data: validHistory.map(s => Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)),
               backgroundColor: 'rgba(153, 102, 255, 0.6)',
               borderColor: 'rgb(153, 102, 255)',
               borderWidth: 1
            }]
        };
    }, [history]);

    const hasData = chartData.labels.length > 0;

    return (
         <div style={styles.container}>
             <h3 style={styles.title}>Session Duration</h3>
             <div style={{ ...styles.chartWrapper, height: '280px' }}>
                 {hasData ? (
                     <Bar options={options} data={chartData} />
                 ) : (
                     <p style={styles.noDataText}>No data available.</p>
                 )}
             </div>
         </div>
     );
}
const styles = { /* ... styles ... */ };
export default SessionDurationChart;