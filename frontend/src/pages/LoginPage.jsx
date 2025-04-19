import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import {
  FaSpinner
} from 'react-icons/fa';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = process.env.REACT_APP_API_BASE_URL;

function LoginPage() {
  const [isMenuOpen, setIsMenuOpen]     = useState(false);
  const [isScrolled, setIsScrolled]     = useState(false);
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState(null);
  const [loading, setLoading]           = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/users/login`, { email, password });
      localStorage.setItem('focusGuardianToken', response.data.token);
      localStorage.setItem('focusGuardianUser', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
       <Navbar />
      {/* Main Content */}
      <main className="login-main">
        <div className="login-background-pattern" />
        <div className="login-form-wrapper">
          <form onSubmit={handleLoginSubmit} className="login-form">
            <div className="login-form-header">
              <h2>Welcome Back</h2>
              <p>Sign in to continue your productivity journey</p>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="form-error">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  <FaSpinner className="spinner" />
                  Signing In...
                </>
              ) : 'Sign In'}
            </button>

            <div className="form-footer">
              <span>Don't have an account? </span>
              <Link to="/register">Create one</Link>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default LoginPage;
