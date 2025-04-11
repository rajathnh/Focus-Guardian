// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom'; // Import Link

function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.'); return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.'); return;
    }
    if (password.length < 6) { // Or other validation
      setError('Password must be at least 6 characters.'); return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/api/users/register', { name, email, password });
      console.log('Registration successful:', response.data);

      // Decide: Auto-login or just inform user? Let's auto-login here for flow.
      localStorage.setItem('focusGuardianToken', response.data.token);
      localStorage.setItem('focusGuardianUser', JSON.stringify(response.data.user));

      navigate('/dashboard'); // Redirect to dashboard

      // Alternative: Inform user and make them log in separately
      // alert('Registration successful! Please proceed to login.');
      // navigate('/login');

    } catch (err) {
      console.error("Register Error:", err);
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '300px', margin: '20px auto' }}>
        <h2>Register</h2>
        <div>
          <label htmlFor="register-name">Name:</label>
          <input type="text" id="register-name" value={name} onChange={(e) => setName(e.target.value)} required style={{ /*...*/ }} />
        </div>
        <div>
          <label htmlFor="register-email">Email:</label>
          <input type="email" id="register-email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ /*...*/ }} />
        </div>
        <div>
          <label htmlFor="register-password">Password:</label>
          <input type="password" id="register-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" style={{ /*...*/ }} />
        </div>
        <div>
          <label htmlFor="register-confirm-password">Confirm Password:</label>
          <input type="password" id="register-confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength="6" style={{ /*...*/ }} />
        </div>
        {error && <p style={{ color: 'red', margin: '0' }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ padding: '10px', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
       <p style={{ textAlign: 'center', marginTop: '15px' }}>
        Already have an account? <Link to="/login">Login here</Link>
      </p>
    </div>
  );
}

export default RegisterPage;