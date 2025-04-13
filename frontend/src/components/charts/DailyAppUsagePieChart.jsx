// src/components/charts/DailyAppUsagePieChart.jsx
import React, { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';

// Assuming getRandomColor is moved to utils or passed as prop
// import { getRandomColor } from '../../utils/formatters';

function DailyAppUsagePieChart({ dailyAppStats, options, getRandomColor }) {
    const chartData = useMemo(() => {
        if (!dailyAppStats || dailyAppStats.length === 0) {
            return { labels: [], datasets: [] };
        }

        // Sort by time descending
        const sortedStats = [...dailyAppStats].sort((a, b) => (b.totalTime || 0) - (a.totalTime || 0));

        const labels = [];
        const data = [];
        const backgroundColors = [];
        const maxAppsToShow = 8; // Adjust as needed
        let otherTime = 0;

        sortedStats.forEach((stat) => {
            const appName = (stat.appName || 'Unknown').replace(/_/g, '.'); // Handle potential null/undefined ID
            const timeInMinutes = Math.round((stat.totalTime || 0) / 60);

            if (timeInMinutes >= 1) { // Only include apps used >= 1 min in total
                if (labels.length < maxAppsToShow) {
                    labels.push(appName);
                    data.push(timeInMinutes);
                    backgroundColors.push(getRandomColor());
                } else {
                    otherTime += timeInMinutes;
                }
            }
        });

        if (otherTime > 0) {
            labels.push('Other');
            data.push(otherTime);
            backgroundColors.push('#cccccc');
        }

        if (labels.length === 0) return { labels: [], datasets: [] };

        return {
            labels: labels,
            datasets: [{
                label: 'Total Time (Minutes)',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#fff',
                borderWidth: 1,
            }],
        };
    }, [dailyAppStats, getRandomColor]); // Add getRandomColor dependency

    const hasData = chartData.labels.length > 0;

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>Daily App Usage Distribution</h3>
            <div style={{ ...styles.chartWrapper, height: '280px' }}>
                {hasData ? (
                    <Pie options={options} data={chartData} />
                ) : (
                    <p style={styles.noDataText}>No significant app usage (`{'>'}`= 1 min).</p>
                )}
            </div>
        </div>
    );
}
// Add basic styles
const styles = { /* ... container, title, chartWrapper, noDataText styles ... */ };
export default DailyAppUsagePieChart;