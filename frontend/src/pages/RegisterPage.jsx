import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Register.css';
import { FaSpinner, FaLock, FaEnvelope, FaUser } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = process.env.REACT_APP_API_BASE_URL;

function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => window.scrollY > 50;
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0); // Scroll to the top left corner
  }, []); 
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.'); 
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.'); 
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.'); 
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/users/register`, { 
        name, 
        email, 
        password 
      });
      localStorage.setItem('focusGuardianToken', response.data.token);
      localStorage.setItem('focusGuardianUser', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <Navbar />
      <main className="register-main">
        <form onSubmit={handleRegisterSubmit} className="register-form">
          <div className="form-header">
            <h2>Create Your Account</h2>
            <p>Start your productivity journey with FocusGuardian</p>
          </div>

          {error && (
            <div className="form-error">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="name">
              <FaUser className="input-icon" />
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="input-group">
            <label htmlFor="email">
              <FaEnvelope className="input-icon" />
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">
              <FaLock className="input-icon" />
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">
              <FaLock className="input-icon" />
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (
              <>
                <FaSpinner className="spinner" />
                Creating Account...
              </>
            ) : 'Get Started'}
          </button>

          <div className="form-footer">
            <span>Already have an account? </span>
            <Link to="/login" className="auth-link">
              Log in here
            </Link>
          </div>
        </form>
      </main>
      <Footer />
    </div>
  );
}

export default RegisterPage;