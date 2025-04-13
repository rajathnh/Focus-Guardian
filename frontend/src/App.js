// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Import Page components
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SessionHistory from './pages/SessionHistory'; // Assuming this is the correct name for SessionHistoryPage component

// --- Import Chart.js setup file ---
import './config/chartjs-setup'; // <-- ADD THIS LINE (adjust path if needed)

// You might still want a basic Navbar outside the routes
// import Navbar from './components/Navbar';

import './App.css';

function App() {
  // Basic check for token could influence Navbar, but pages handle redirects now
  // const hasToken = !!localStorage.getItem('focusGuardianToken');

  return (
    <Router>
      <div className="App">
        {/* Optional: <Navbar /> component here if desired */}

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} /> {/* Route for Login Page */}
          <Route path="/register" element={<RegisterPage />} /> {/* Route for Register Page */}
          <Route path="/dashboard" element={<DashboardPage />} /> {/* Dashboard handles its own auth check */}
          {/* Ensure the component imported as 'SessionHistory' is actually 'SessionHistoryPage' if that's the filename */}
          <Route path="/session" element={<SessionHistory />} /> {/* Handles its own auth check */}
          {/* Remove the old "/auth" route if it exists */}

          {/* Optional 404 */}
          {/* <Route path="*" element={<h1>404 Not Found</h1>} /> */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;