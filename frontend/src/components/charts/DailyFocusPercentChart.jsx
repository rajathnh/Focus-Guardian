import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

function DailyFocusPercentChart({ dailyData, options, formatDateShort }) {
    const chartData = useMemo(() => {
        if (!dailyData || dailyData.length === 0) return { labels: [], datasets: [] };
        return {
            labels: dailyData.map(d => formatDateShort(d.date)),
            datasets: [{
                label: 'Focus Percentage (%)',
                data: dailyData.map(d => d.focusPercentage || 0),
                backgroundColor: 'rgba(53, 162, 235, 0.6)',
                borderColor: 'rgb(53, 162, 235)',
                borderWidth: 1,
            }]
        };
    }, [dailyData, formatDateShort]);

    const hasData = chartData.labels.length > 0;

    return (
        <div style={styles.container}>
             <h3 style={styles.title}>Daily Focus Percentage</h3>
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
export default DailyFocusPercentChart;