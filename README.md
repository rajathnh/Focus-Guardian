![github-submission-banner](https://github.com/user-attachments/assets/a1493b84-e4e2-456e-a791-ce35ee2bcf2f)

# 🚀 Focus Guardian

> Unlock Peak Productivity with AI-Driven Focus Insights.

---

## 📌 Problem Statement

**Problem Statement 1 – Weave AI Magic with Groq**

---

## 🎯 Objective

Focus Guardian tackles the challenge of maintaining focus and understanding productivity habits in today's distraction-filled digital work environments. It serves students, professionals, remote workers, or anyone seeking to minimize digital distractions and enhance their concentration during work sessions.

Leveraging the **exceptional low latency of Groq's AI inference**, Focus Guardian provides **real-time analysis** of user focus, something impractical with slower APIs. This allows for immediate feedback and accurate tracking, offering significant value by:

1.  **Objectively Tracking Focus in Real-Time:** Using Groq's fast vision analysis of webcam and screen activity to instantly determine if the user is engaged in work-related tasks.
2.  **Providing Actionable Insights:** Aggregating data on focus time, distraction time, and application usage, presented through historical logs and visual charts.
3.  **Facilitating Reflection:** Offering an AI chat assistant (powered by Groq LLM and STT) that uses the user's productivity data to provide contextual feedback, encouragement, and answers to queries about their performance patterns.

---

## 🧠 Team & Approach

### Team Name:
`Legion Hackers`

### Team Members:
- Rajath N H
- Prajnan Vaidya
- Preeti Bhat
- Yashaswini D B


### Your Approach:
We chose Problem Statement 1 to specifically showcase the practical application of Groq's high-speed AI inference. We recognized that building a truly *real-time* productivity tracker, capable of analyzing visual data frequently without significant lag, was only feasible with technology like Groq's LPU. Standard APIs would introduce too much latency, making the feedback loop ineffective.

**Key Challenges Addressed:**
-   **Prompt Engineering:** Designing effective prompts for the Groq vision model (Llama 4 Scout) to accurately interpret combined webcam/screen data and reliably output structured JSON, considering gaze direction and screen content simultaneously.
-   **Real-time Data Handling:** Managing the capture (webcam/screen), processing (canvas drawing, Data URI generation), and transmission of image data from the frontend at regular intervals without overwhelming the browser or backend.
-   **State Synchronization:** Keeping the frontend UI (timers, status indicators, analysis results) accurately synchronized with the backend state and the asynchronous nature of AI analysis and potential rate limits.
-   **Multimodal Chat Context:** Integrating user-specific, time-sensitive productivity data (Yesterday, Today, Last Session, Current Status) effectively into the Groq LLM (Llama 3) context for relevant and personalized chat responses, including handling audio input via Groq STT (Whisper).

**Breakthroughs:**
-   Achieving a functional real-time analysis loop where the latency between capture, AI analysis via Groq, and feedback display was minimal enough to feel responsive.
-   Refining the AI Chat Assistant's persona and data injection logic to provide genuinely helpful and data-aware insights, rather than generic responses.

---

## 🛠️ Tech Stack

### Core Technologies Used:
- **Frontend:** React, React Router, Axios, Chart.js, HTML5 Media APIs (getUserMedia, getDisplayMedia, MediaRecorder), Canvas API
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (with Mongoose ODM)
- **APIs:** Groq API
- **Hosting:** Vercel + Cloud Run(`https://focus-guardian-five.vercel.app/`)

### Sponsor Technologies Used (if any):
- [✅] **Groq:** Used extensively for:
    - **Vision Analysis:** Analyzing combined webcam/screen images via Llama 4 Scout model at low latency to determine user focus, application, and activity in near real-time.
    *   **LLM Chat:** Powering the AI Chat Assistant using Llama 3 model for fast, contextual conversation based on injected user data.
    *   **Speech-to-Text:** Transcribing user audio messages rapidly via Whisper model for seamless voice interaction with the chatbot.

---

## ✨ Key Features

Highlight the most important features of your project:

- ✅ **AI-Powered Focus Analysis:** Real-time determination of user focus state based on webcam (gaze direction) and screen content (work vs. non-work apps) using Groq Vision API.
- ✅ **Session Tracking & Management:** Start, stop, and automatically track focus/distraction time and application usage during dedicated sessions.
- ✅ **Interactive AI Chat Assistant:** Engage in text or voice conversations with an AI assistant that understands your productivity data (Today, Yesterday, Last Session, Current Status) and provides contextual insights and feedback, powered by Groq LLM & STT.
- ✅ **Data Visualization & History:** View aggregated daily/session statistics (Focus Time, Focus %, App Usage) via charts and browse a detailed log of past sessions with inline details and app usage breakdowns.
- ✅ **Secure User Authentication:** Standard registration and login functionality using JWT for secure access to personal data and session tracking.
- ✅ **Real-time Feedback Loop:** Dashboard provides live updates on elapsed session time and the latest analysis results from the AI.

*(Consider adding screenshots/GIFs here showing the Dashboard, Chatbot, and Analytics page)*

---

## 📽️ Demo & Deliverables

- **Demo Video Link:** `[User Input Required: Paste YouTube or Loom link here]`
- **Pitch Deck / PPT Link:** `[https://drive.google.com/file/d/1DAJmVCrJRfzepIArf9m2PKD9NkQZoa-7/view?usp=sharing]`

---

## ✅ Tasks & Bonus Checklist

- [✅] **All members of the team completed the mandatory task - Followed at least 2 of our social channels and filled the form** (Details in Participant Manual)
- [✅] **All members of the team completed Bonus Task 1 - Sharing of Badges and filled the form (2 points)** (Details in Participant Manual)
- [✅] **All members of the team completed Bonus Task 2 - Signing up for Sprint.dev and filled the form (3 points)** (Details in Participant Manual)

*(Mark with ✅ if completed)*

---

## 🧪 How to Run the Project

### Requirements:
- Node.js (v18 or later recommended)
- npm or yarn
- MongoDB instance (local or cloud like MongoDB Atlas)
- Groq API Key

### Environment Setup:

1.  **Backend (`backend` directory):**
    *   Create a `.env` file in the `backend` directory.
    *   Add the following variables:
        ```env
        MONGO_URI=your_mongodb_connection_string
        JWT_SECRET=your_strong_jwt_secret_key
        GROQ_API_KEY=your_groq_api_key
        PORT=8080 # Or any port you prefer
        # Optional:
        # NODE_ENV=development
        # FRONTEND_URL=http://localhost:3000 # For CORS in production
        # JSON_LIMIT=1mb # Or adjust as needed
        ```

2.  **Frontend (`frontend` directory):**
    *   Create a `.env` file in the `frontend` directory (usually the root of the React app).
    *   Add the following variable, pointing to your backend server:
        ```env
        REACT_APP_API_BASE_URL=http://localhost:8080 # Or your backend's URL
        ```

### Local Setup:

```bash
# Clone the repository
git clone https://github.com/[Your-GitHub-Username]/[Your-Repo-Name]
cd [Your-Repo-Name]

# Setup Backend
cd backend
npm install
npm start # Or npm run dev if you have a dev script

# Setup Frontend (in a separate terminal)
cd ../frontend # Assuming frontend is sibling to backend
npm install
npm start


The frontend should now be accessible (usually at http://localhost:3000) and communicating with the backend (running at http://localhost:8080 or your specified port).

🧬 Future Scope

List improvements, extensions, or follow-up features:

📈 Deeper Analytics & Insights: Implement weekly/monthly summaries, identify recurring distraction patterns (time of day, specific apps), and offer more proactive insights through the chatbot.

🎯 Customizable Goals & Targets: Allow users to set specific focus duration or percentage goals per day/week and visualize progress towards them.

✨ Personalized Nudges & Tips: Based on detected patterns, the chatbot could suggest taking a break, blocking a specific distracting app temporarily, or offer tailored focus techniques.

📅 Calendar/Task Integration: Connect with tools like Google Calendar or Todoist to automatically link focus sessions to specific tasks or events, providing better context for analysis.

🚫 Website/App Blocking (Optional): Explore integrations with browser extensions or system tools to optionally block user-defined distracting sites/apps during a focus session.

📱 Mobile Companion App: Develop a simple mobile app (React Native?) primarily for viewing stats on the go and interacting with the chatbot.

🌐 Improved Accessibility & Localization: Enhance UI accessibility and add multi-language support for broader usability.

📎 Resources / Credits

Core Libraries: React, Node.js, Express.js, Mongoose, Axios, Chart.js, React Router DOM

Authentication/Security: jsonwebtoken, bcryptjs

AI Services: Groq Cloud API (groq-sdk)

Development Tools: dotenv, nodemon (likely used), cors, multer

Inspiration/Concepts: Productivity tracking tools, AI assistants, real-time data processing applications.

🏁 Final Words

Building Focus Guardian during this hackathon was an exciting dive into the potential of real-time AI. Leveraging Groq's incredible speed allowed us to create a tool that provides immediate feedback on user focus, something we felt was crucial for a productivity application. The biggest challenge was orchestrating the flow of data – capturing streams, processing images, getting quick analysis from Groq Vision, updating the database, and reflecting changes instantly on the frontend, all while managing the complexities of the AI Chat Assistant's context. Integrating the multimodal aspects (vision, text, speech-to-text) via Groq was a fantastic learning experience. We're proud of creating a functional prototype that showcases how low-latency AI can power genuinely useful, interactive applications. It was a intense but rewarding journey for Team Legion Hackers!

