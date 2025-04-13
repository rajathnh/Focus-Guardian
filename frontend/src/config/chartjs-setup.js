// src/config/chartjs-setup.js
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement, // For Pie
    Title,
    Tooltip,
    Legend,
    Filler, // For Line fill
    TimeScale,
    TimeSeriesScale
} from 'chart.js';
import 'chartjs-adapter-date-fns'; // Ensure adapter is loaded

// Register all potentially needed components globally ONCE
ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
    Title, Tooltip, Legend, Filler, TimeScale, TimeSeriesScale
);

// You can export something simple or nothing if just running the registration is the goal
// export const setupCharts = () => { console.log("Chart.js components registered."); };