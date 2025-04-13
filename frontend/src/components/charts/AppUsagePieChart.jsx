import React, { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';

// Assuming getRandomColor is moved to utils or passed as prop
// import { getRandomColor } from '../../utils/formatters';

function AppUsagePieChart({ sessionData, options, getRandomColor }) { // Receive helper
    const chartData = useMemo(() => {
        if (!sessionData || !sessionData.appUsage || Object.keys(sessionData.appUsage).length === 0) {
            return { labels: [], datasets: [] };
        }
        // --- Calculation logic moved here ---
        const appEntries = Object.entries(sessionData.appUsage);
        appEntries.sort(([, timeA], [, timeB]) => timeB - timeA);
        const labels = [];
        const data = [];
        const backgroundColors = [];
        const maxAppsToShow = 10;
        let otherTime = 0;
        appEntries.forEach(([appName, time]) => {
             const timeInMinutes = Math.round(time / 60);
             if (timeInMinutes >= 1) {
                 if (labels.length < maxAppsToShow) {
                    labels.push(appName.replace(/_/g, '.'));
                    data.push(timeInMinutes);
                    backgroundColors.push(getRandomColor()); // Use passed helper
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
                label: 'Time Spent (Minutes)', data: data,
                backgroundColor: backgroundColors, borderColor: '#fff', borderWidth: 1,
            }],
        };
        // Add getRandomColor to dependency array if it's not guaranteed stable
    }, [sessionData, getRandomColor]);

    const hasData = chartData.labels.length > 0;

    return (
        // Note: Title is now part of options in SessionHistoryPage or add it here
        <div style={{ ...styles.chartWrapper, height: '280px' }}>
            {hasData ? (
                <Pie options={options} data={chartData} />
            ) : (
                <p style={styles.noDataText}>No significant app usage (`{'>'}`= 1 min).</p>
            )}
        </div>
    );
}
// Pie chart doesn't need container/title styles if used inside existing styled area
const styles = { chartWrapper: { position: 'relative' }, noDataText: { textAlign: 'center', color: '#666' } };
export default AppUsagePieChart;