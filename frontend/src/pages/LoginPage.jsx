// src/pages/LoginPage.js (Assuming it's in a 'pages' folder)

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css'; // Ensure you have this CSS file or adjust styles
import {
  FaSpinner // Loading spinner icon
} from 'react-icons/fa';
import Navbar from '../components/Navbar'; // Adjust path as needed
import Footer from '../components/Footer'; // Adjust path as needed

// Ensure the API URL is correctly set in your environment variables or provide a default
const API_URL = process.env.REACT_APP_API_BASE_URL || '';

function LoginPage() {
  // State for Navbar functionality (if needed)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // State for Navbar background based on scroll
  const [isScrolled, setIsScrolled] = useState(false);
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // UI state
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // --- Effect for Navbar scroll background ---
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    // Use passive listener for better scroll performance
    window.addEventListener('scroll', onScroll, { passive: true });
    // Cleanup function to remove the listener when the component unmounts
    return () => window.removeEventListener('scroll', onScroll);
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Effect to scroll to top when LoginPage mounts ---
  useEffect(() => {
    window.scrollTo(0, 0); // Scroll to the top-left corner of the page
  }, []); // Empty dependency array ensures this runs only once when the component mounts

  // --- Handle Login Form Submission ---
  const handleLoginSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission behavior
    setError(null); // Clear previous errors
    setLoading(true); // Set loading state

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      // Make API request to backend login endpoint
      const response = await axios.post(`${API_URL}/api/users/login`, { email, password });

      // Check if response structure is as expected
      if (response.data && response.data.token && response.data.user) {
        // Store token and user data in localStorage
        localStorage.setItem('focusGuardianToken', response.data.token);
        localStorage.setItem('focusGuardianUser', JSON.stringify(response.data.user));

        // Navigate to the dashboard upon successful login
        navigate('/dashboard');
      } else {
        // Handle unexpected response structure
        throw new Error("Invalid response data received from server.");
      }
    } catch (err) {
      // Log the full error for debugging purposes
      console.error("Login Error:", err);
      // Set user-friendly error message based on API response or generic message
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      // Ensure loading state is turned off regardless of success or failure
      setLoading(false);
    }
  };

  // --- JSX Rendering ---
  return (
    <div className="login-page">
       {/* Pass necessary props to Navbar */}
       <Navbar
         isScrolled={isScrolled}
         isMenuOpen={isMenuOpen}
         setIsMenuOpen={setIsMenuOpen}
         hideLoginButton={true} // Hide login button on the login page itself
       />

      {/* Main Content Area */}
      <main className="login-main">
        {/* Optional background pattern */}
        <div className="login-background-pattern" />

        {/* Form Wrapper */}
        <div className="login-form-wrapper">
          <form onSubmit={handleLoginSubmit} className="login-form">
            {/* Form Header */}
            <div className="login-form-header">
              <h2>Welcome Back</h2>
              <p>Sign in to continue your productivity journey</p>
            </div>

            {/* Email Input Group */}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required // HTML5 required attribute
                autoComplete="email" // Helps with browser autofill
                disabled={loading} // Disable input while loading
              />
            </div>

            {/* Password Input Group */}
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password" // Helps with browser autofill
                disabled={loading} // Disable input while loading
              />
            </div>

            {/* Error Message Display */}
            {error && (
              <div className="form-error">
                {/* Error Icon (Accessibility: hidden from screen readers) */}
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" />
                </svg>
                {/* Error Text */}
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  {/* Loading Spinner Icon */}
                  <FaSpinner className="spinner" aria-hidden="true"/>
                  {/* Loading Text */}
                  <span>Signing In...</span>
                </>
              ) : (
                // Default Button Text
                'Sign In'
              )}
            </button>

            {/* Link to Registration Page */}
            <div className="form-footer">
              <span>Don't have an account? </span>
              <Link to="/register">Create one</Link>
            </div>
          </form>
        </div>
      </main>

      {/* Footer Component */}
      <Footer />
    </div>
  );
}

export default LoginPage;