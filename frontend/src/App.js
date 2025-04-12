// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; // No need for Link here anymore if handled within pages/Navbar

// Import Page components
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage'; // New Import
import RegisterPage from './pages/RegisterPage'; // New Import
import DashboardPage from './pages/DashboardPage'; // Keeping this
import SessionHistory from './pages/SessionHistory'; // New Import

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
          <Route path="/session" element={<SessionHistory />} /> {/* Dashboard handles its own auth check */}
          {/* Remove the old "/auth" route if it exists */}

          {/* Optional 404 */}
          {/* <Route path="*" element={<h1>404 Not Found</h1>} /> */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;