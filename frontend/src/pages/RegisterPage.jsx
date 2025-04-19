import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Register.css';

import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = process.env.REACT_APP_API_BASE_URL;

function RegisterPage() {
  const [name, setName] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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
    <div className='register-container'>
       <Navbar />
      <main className="register-main-content">
        <form onSubmit={handleRegisterSubmit} className="register-form-container">
          <h2 className="register-form-title">Create Your Account</h2>
          <div className="register-input-group">
            <label htmlFor="register-name">Full Name</label>
            <input 
              type="text" 
              id="register-name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="register-input" 
              placeholder="Enter your full name"
            />
          </div>
          <div className="register-input-group">
            <label htmlFor="register-email">Email Address</label>
            <input 
              type="email" 
              id="register-email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="register-input" 
              placeholder="Enter your email"
            />
          </div>
          <div className="register-input-group">
            <label htmlFor="register-password">Password</label>
            <input 
              type="password" 
              id="register-password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="register-input" 
              placeholder="Create a password"
            />
          </div>
          <div className="register-input-group">
            <label htmlFor="register-confirm-password">Confirm Password</label>
            <input 
              type="password" 
              id="register-confirm-password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              className="register-input" 
              placeholder="Confirm your password"
            />
          </div>
          {error && <p className="register-error">{error}</p>}
          <button type="submit" disabled={loading} className="register-button">
            {loading ? 'Creating Account...' : 'Get Started'}
          </button>
          <p className="auth-redirect">
            Already have an account? 
            <Link to="/login" className="auth-link">Log in here</Link>
          </p>
        </form>
      </main>

      <Footer />
    </div>
  );
}

export default RegisterPage;