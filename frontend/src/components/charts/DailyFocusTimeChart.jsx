import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

// Assuming formatDateShort is moved to utils or passed as prop
// import { formatDateShort } from '../../utils/formatters'; // Example path

function DailyFocusTimeChart({ dailyData, options, formatDateShort }) { // Accept helper as prop
    const chartData = useMemo(() => {
        if (!dailyData || dailyData.length === 0) return { labels: [], datasets: [] };
        return {
            labels: dailyData.map(d => formatDateShort(d.date)),
            datasets: [{
                label: 'Focus Time (Minutes)',
                data: dailyData.map(d => Math.round((d.focusTime || 0) / 60)),
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgb(75, 192, 192)',
                borderWidth: 1,
            }]
        };
    }, [dailyData, formatDateShort]); // Add helper to dependency array

    const hasData = chartData.labels.length > 0;

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>Daily Focus Time</h3>
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

// Add basic styles (can be shared or unique)
const styles = { /* ... container, title, chartWrapper, noDataText styles ... */ };

export default DailyFocusTimeChart;