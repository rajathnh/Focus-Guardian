import React, { useState, useEffect } from 'react';
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './navbar.css';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled]     = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>      
      <div className="nav-content container">
        <div className="logo-container hover-scale" onClick={() => navigate('/') }>
          <div className="logo-circle">
            <img src="/images/logo.png" alt="Focus Guardian Logo" className="logo-image" />
          </div>
          <span className="brand-name">Focus Guardian</span>
        </div>
        <div className="desktop-nav">
          <a href="/#home" className="nav-link">Home</a>
          <a href="/#features" className="nav-link">Features</a>
          <a href="/#testimonials" className="nav-link">Testimonials</a>
          <a href="/#contact" className="nav-link">Contact</a>
        </div>
        <button
          className={`mobile-menu-btn ${isMenuOpen ? 'open' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="menu-line top" />
          <span className="menu-line middle" />
          <span className="menu-line bottom" />
        </button>
      </div>
      <div className={`mobile-nav ${isMenuOpen ? 'open' : ''}`}>
        <a href="/#home" className="mobile-nav-link">Home</a>
        <a href="/#features" className="mobile-nav-link">Features</a>
        <a href="/#testimonials" className="mobile-nav-link">Testimonials</a>
        <a href="/#contact" className="mobile-nav-link">Contact</a>
      </div>
    </nav>
  );
};

export default Navbar;