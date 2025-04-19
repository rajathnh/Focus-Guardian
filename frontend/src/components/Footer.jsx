import React from 'react';
import {
  FaFacebookF,
  FaTwitter,
  FaLinkedinIn,
  FaInstagram,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt
} from 'react-icons/fa';
import './footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-branding">
          <div className="footer-logo hover-scale">
            <img src="/images/logo.png" alt="Focus Guardian Logo" className="logo-image" />
          </div>
          <div className="brand-text">
            <h2 className="footer-brand">Focus Guardian</h2>
            <p className="brand-tagline">Elevate Your Productivity with AI-Powered Solutions</p>
          </div>
          <div className="social-links">
            <a href="#" aria-label="Facebook"><FaFacebookF /></a>
            <a href="#" aria-label="Twitter"><FaTwitter /></a>
            <a href="#" aria-label="LinkedIn"><FaLinkedinIn /></a>
            <a href="#" aria-label="Instagram"><FaInstagram /></a>
          </div>
        </div>

        <div className="footer-newsletter">
          <div className="newsletter-header">
            <h3>Stay Productive</h3>
            <p>Subscribe to get tips & updates</p>
          </div>
          <form className="newsletter-form">
            <input 
              type="email" 
              placeholder="Enter your email" 
              aria-label="Subscribe newsletter"
            />
            <button type="submit" className="btn-gradient">
              Subscribe
            </button>
          </form>
        </div>

        <div className="footer-contact">
          <h3>Get in Touch</h3>
          <div className="contact-item">
            <FaEnvelope className="contact-icon" />
            <div>
              <p>Email Support</p>
              <a href="mailto:support@focusguardian.com">support@focusguardian.com</a>
            </div>
          </div>
          <div className="contact-item">
            <FaPhone className="contact-icon" />
            <div>
              <p>Call Us</p>
              <a href="tel:+15551234567">+1 (555) 123‑4567</a>
            </div>
          </div>
          <div className="contact-item">
            <FaMapMarkerAlt className="contact-icon" />
            <div>
              <p>Visit Us</p>
              <span>456 Productivity Ave, San Francisco</span>
            </div>
          </div>
        </div>
      </div>
      <p className="footer-copyright">
        © 2024 Focus Guardian. All rights reserved.
      </p>
    </footer>
  );
};

export default Footer;