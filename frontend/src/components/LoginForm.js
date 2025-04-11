// src/components/LoginForm.js
import React, { useState } from 'react';
import axios from 'axios';
// import { useNavigate } from 'react-router-dom'; // We'll add this later for redirection
// import { useAuth } from '../context/AuthContext'; // We'll add context later

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // const navigate = useNavigate(); // Initialize navigation hook later
  // const { login } = useAuth();    // Get login function from context later

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); // Clear previous errors
    setLoading(true);

    if (!email || !password) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      // Make API call to your backend login endpoint
      // The proxy in package.json handles forwarding '/api' to 'http://localhost:5000'
      const response = await axios.post('/api/users/login', {
        email,
        password,
      });

      console.log('Login successful:', response.data); // For now, just log success

      // ** LATER: Integrate with AuthContext **
      // login(response.data.token, response.data.user); // Store token and user data

      // ** LATER: Redirect on success **
      // navigate('/dashboard'); // Or wherever you want to go after login

    } catch (err) {
      console.error("Login error:", err);
      // Display error message from backend if available, otherwise a generic one
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false); // Stop loading indicator
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '300px', margin: 'auto' }}>
      <h2>Login</h2>
      <div>
        <label htmlFor="login-email">Email:</label>
        <input
          type="email"
          id="login-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>
      <div>
        <label htmlFor="login-password">Password:</label>
        <input
          type="password"
          id="login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>
      {error && <p style={{ color: 'red', margin: '0' }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ padding: '10px', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

export default LoginForm;