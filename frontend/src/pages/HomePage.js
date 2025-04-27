// src/pages/HomePage.jsx
import React, { useState,useRef, useEffect } from 'react';
import './home.css';
import { useNavigate } from 'react-router-dom';
import {
  FaFacebookF,
  FaTwitter,
  FaLinkedinIn,
  FaInstagram,
} from 'react-icons/fa';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { FaRegClock, FaChartLine, FaRegEye } from 'react-icons/fa';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const HomePage = () => {
  const [isMenuOpen, setIsMenuOpen]       = useState(false);
  const [isScrolled, setIsScrolled]       = useState(false);
  const [isq1Open, setIsq1Open]           = useState(false);
  const [isq2Open, setIsq2Open]           = useState(false);
  const [isq3Open, setIsq3Open]           = useState(false);
  const [isq4Open, setIsq4Open]           = useState(false);
  const [showThankYou, setShowThankYou]   = useState(false);
  const [wrapperWidth, setWrapperWidth]   = useState(0);
  const wrapperRef                        = useRef(null);

  const [formData, setFormData]           = useState({ name:'', email:'', message:'' });
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const testimonials = [
    {
      text: `“Focus Guardian revolutionized my workflow. The analytics helped me identify productivity patterns I never noticed!  
      I especially love the detailed weekly reports with actionable insights.  
      The team dashboard keeps everyone aligned, and the smart break reminders have helped me maintain energy all day.”`,
      author: "Sarah Johnson",
      role: "UX Designer",
      img: "testi1.jpg",
    },
    {
      text: `“The focus sessions feature is a game‑changer. I've doubled my output while working fewer hours.  
      The customizable timer options let me switch between Pomodoro and deep‑work modes on the fly.  
      And the distraction blocker has kept me on track during critical design sprints.”`,
      author: "Michael Chen",
      role: "Software Engineer",
      img: "testim2.jpg",
    },
    {
      text: `“Best investment in my productivity this year. The group focus rooms keep our remote team aligned and focused.  
      I appreciate the ambient soundscapes—especially the “Forest” mode for deep concentration.  
      Exportable progress charts make our stand‑ups a breeze.”`,
      author: "Emma Wilson",
      role: "Project Manager",
      img: "testi3.jpg",
    },
  ];

  

  const navigate = useNavigate();

  // measure wrapper width for carousel
  useEffect(() => {
    const updateWidth = () => {
      if (wrapperRef.current) {
        setWrapperWidth(wrapperRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

    const nextTestimonial = () => {
    setActiveTestimonial(prev => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setActiveTestimonial(prev => (prev - 1 + testimonials.length) % testimonials.length);};

  // change nav style on scroll
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(nextTestimonial, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleGetStarted = () => navigate('/register');
  const handleLogin      = () => navigate('/login');

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    // clear fields
    setFormData({ name:'', email:'', message:'' });
    // show popup
    setShowThankYou(true);
  };
  const closeModal = () => setShowThankYou(false);
  return (
    <div className="home-container">
       <Navbar />
      {/* Hero */}
<section id="home" className="hero-section">
  <div className="hero-overlay" />
  <div className="hero-content container">
    <h1 className="hero-heading">
      Enhance Your Productivity<br />
      with Focus Guardian
    </h1>
    <p className="hero-text">
      Leverage the power of AI to track and boost your productivity. Get insights that help you stay on task.
    </p>
    <button className="hero-button" onClick={handleGetStarted}>
      Get Started
    </button>
  </div>
</section>

{/* Features */}
<section id="features" className="features-section">
  <div className="container">
    <h2 className="section-heading">Powerful Productivity Tools</h2>
    <div className="features-grid">
      {/* Card 1 */}
      <div className="feature-card hover-scale left-card">
        <div className="card-content">
          <FaRegClock className="card-icon" />
          <h3 className="card-heading">Session Management</h3>
          <p className="card-text">
            Easily start, pause, and end sessions with smart AI tracking. Keep your workflow organized with automatic time logging and intuitive UI.
          </p>
          <ul className="feature-list">
            <li>Start/Stop timers</li>
            <li>Smart AI tracking</li>
            <li>Daily & weekly summaries</li>
          </ul>
        </div>
        <div className="card-image-container">
          <img src="/images/image1.jpg" alt="Session Management" className="card-image" />
        </div>
      </div>

      {/* Card 2 */}
      <div className="feature-card hover-scale middle-card horizontal-card">
        <div className="horizontal-card-content">
          <FaChartLine className="card-icon" />
          <h3 className="card-heading">Advanced Insights</h3>
          <p className="card-text">
            Unlock valuable insights into your productivity trends with deep analytics, heatmaps, and efficiency scores.
          </p>
          <ul className="feature-list">
            <li>Detailed reports & graphs</li>
            <li>Productivity heatmaps</li>
            <li>Custom report exports</li>
          </ul>
        </div>
        <img src="/images/image2.jpg" alt="Advanced Insights" className="card-image full-height-image" />
      </div>

      {/* Card 3 */}
      <div className="feature-card hover-scale right-card">
        <div className="card-content">
          <FaRegEye className="card-icon" />
          <h3 className="card-heading">Focus Control</h3>
          <p className="card-text">
            Maximize concentration with customizable focus sessions, intelligent interruption control, and ambient soundscapes.
          </p>
          <ul className="feature-list">
            <li>Pomodoro & deep work modes</li>
            <li>Smart notifications</li>
            <li>Ambient background sounds</li>
          </ul>
        </div>
        <div className="card-image-container">
          <img src="/images/image3.jpg" alt="Focus Control" className="card-image" />
        </div>
      </div>
    </div>
  </div>
</section>

      
    {/* Call To Action */}
<section className="cta-section">
  <div className="cta-box container">
    <h2 className="cta-heading">Start Your Productivity Journey</h2>
    <p className="cta-text">
      Join thousands reclaiming their time and focus. With Focus Guardian, building habits and staying on track has never been easier.
    </p>
    <div className="cta-buttons">
      <button className="cta-button-primary" onClick={handleGetStarted}>
        Get Started
      </button>
      <button className="cta-button-secondary" onClick={handleLogin}>
        Log In
      </button>
    </div>
  </div>
</section>


     {/* Team */}
<section id="team" className="team-section">
  <div className="container">
    <h2 className="section-heading">Our Team</h2>
    <div className="team-grid">
      {[
        { name: 'Rajath N H', role: 'Backend Developer', img: 'Rajath.png' },
        { name: 'Yashaswini D B', role: 'Database Architect', img: 'Yashaswini.jpg' },
        { name: 'Preeti Bhat', role: 'Assistant Backend Developer', img: 'Preeti.jpg' },
        { name: 'Prajnan Vaidya', role: 'Frontend Developer', img: 'Prajnan.jpg' },
      ].map((member) => (
        <div className="team-card hover-scale" key={member.name}>
          <img
            src={`/images/team/${member.img}`}
            alt={member.name}
            className="team-photo"
          />
          <h3 className="team-name">{member.name}</h3>
          <p className="team-role">{member.role}</p>
        </div>
      ))}
    </div>
  </div>
</section>


{/* Testimonials */}
<section id="testimonials" className="testimonials-section">
      <div className="container">
        <div className="section-divider" />
        <h2 className="section-heading">Testimonials</h2>

        <div className="testimonials-wrapper" ref={wrapperRef}>
          <div
            className="testimonial-cards-container"
            style={{
              transform: `translateX(-${activeTestimonial * 100}%)`,
              transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`testimonial-card ${i === activeTestimonial ? 'active' : ''}`}
              >
                <p className="testimonial-text">{t.text}</p>
                <div className="testimonial-author">
                  <img
                    src={`/images/${t.img}`}
                    alt={t.author}
                    className="author-photo"
                  />
                  <div>
                    <h4 className="author-name">{t.author}</h4>
                    <p className="author-role">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="testimonial-controls">
            <button 
              className="arrow-btn prev" 
              onClick={prevTestimonial}
              aria-label="Previous testimonial"
            >
              <FaChevronLeft />
            </button>
            <div className="indicators">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  className={`indicator ${i === activeTestimonial ? "active" : ""}`}
                  onClick={() => setActiveTestimonial(i)}
                  aria-label={`View testimonial ${i + 1}`}
                />
              ))}
            </div>
            <button 
              className="arrow-btn next" 
              onClick={nextTestimonial}
              aria-label="Next testimonial"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      </div>
    </section>

    {/* FAQs Section */}
<section className="contact-faqs">
  <div className="container">
    <div className="faqs">
      <h2 className="section-heading">Frequently Asked Questions</h2>
      <p className="section-intro">
        Learn more about how Focus Guardian empowers students to stay focused and parents to stay informed.
      </p>
      {[
        {
          q: 'What is Focus Guardian?',
          a: 'Focus Guardian is an AI-powered platform that helps students manage distractions and maintain concentration during study hours, while also enabling parents to track progress.',
          open: isq1Open,
          toggle: () => setIsq1Open(!isq1Open),
        },
        {
          q: 'Is my data secure?',
          a: 'Absolutely. Focus Guardian uses encryption and follows strict privacy practices to ensure your data is protected and only accessible by you and authorized users.',
          open: isq2Open,
          toggle: () => setIsq2Open(!isq2Open),
        },
        {
          q: 'Can parents monitor in real-time?',
          a: 'Yes, parents get real-time updates about their child’s focus level, study patterns, and can even get alerts for significant distractions.',
          open: isq3Open,
          toggle: () => setIsq3Open(!isq3Open),
        },
        {
          q: 'Does it work offline?',
          a: 'Focus Guardian offers limited offline functionality, and automatically syncs data when the device reconnects to the internet.',
          open: isq4Open,
          toggle: () => setIsq4Open(!isq4Open),
        },
      ].map((faq, idx) => (
        <div className="faq-item" key={idx}>
          <div
            className="faq-question hover-scale"
            onClick={faq.toggle}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && faq.toggle()}
          >
            {faq.q}
            <svg
  className={`arrow-icon ${faq.open ? 'open' : ''}`}
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M6 9L12 15L18 9"
    stroke="var(--clr-primary)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
</svg>

          </div>
          <div
            className="faq-answer"
            style={{ display: faq.open ? 'block' : 'none' }}
          >
            {faq.a}
          </div>
        </div>
      ))}
    </div>

    {/* Contact Form */}
    <div id="contact" className="contact-form">
      <h2 className="section-heading">Contact Us</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="name"
          type="text"
          placeholder="Your Full Name"
          required
          value={formData.name}
          onChange={handleChange}
        />
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          required
          value={formData.email}
          onChange={handleChange}
        />
        <textarea
          name="message"
          placeholder="Your Message"
          required
          value={formData.message}
          onChange={handleChange}
        />
        <button type="submit" className="submit-btn">
          Send Message
        </button>
      </form>
    </div>
  </div>
</section>


      {/* Thank You Modal */}
      {showThankYou && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content">
            <p>Thank you for your message! We will get back to you soon.</p>
            <button onClick={closeModal}>Close</button>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default HomePage;
