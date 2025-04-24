![github-submission-banner](https://github.com/user-attachments/assets/a1493b84-e4e2-456e-a791-ce35ee2bcf2f)

# 🚀 Focus Guardian

> An AI-powered application to track digital focus, analyze productivity patterns, and provide insights through an interactive chat assistant.

---

## 📌 Problem Statement

[User Input Required: Select the problem statement number and title from the official list given in Participant Manual.]

**Example:**
**Problem Statement 7 – Transform the Future of Rural Commerce**

---

## 🎯 Objective

Focus Guardian aims to solve the challenge of maintaining focus and understanding productivity habits in digital work environments. It serves students, professionals, remote workers, or anyone looking to minimize distractions and enhance their concentration.

The application provides value by:
1.  **Objectively Tracking Focus:** Using AI analysis of webcam and screen activity to determine if the user is engaged in work-related tasks.
2.  **Providing Actionable Insights:** Aggregating data on focus time, distraction time, and application usage, presented through historical logs and visual charts.
3.  **Facilitating Reflection:** Offering an AI chat assistant that leverages the user's productivity data to provide contextual feedback, encouragement, and answers to queries about their performance patterns.

---

## 🧠 Team & Approach

### Team Name:
`Legion Hackers`

### Team Members:
- `[User Input Required: Name 1 (GitHub / LinkedIn / Role)]`
- `[User Input Required: Name 2 (GitHub / LinkedIn / Role)]`
- `[User Input Required: Name 3 (GitHub / LinkedIn / Role)]`
*(Add links if you want)*

### Your Approach:
- `[User Input Required: Why you chose this problem]`
- `[User Input Required: Key challenges you addressed (e.g., real-time analysis, AI prompting, data aggregation, frontend state management)]`
- `[User Input Required: Any pivots, brainstorms, or breakthroughs during hacking (e.g., switching AI models, changing data capture frequency, refining chatbot persona)]`

---

## 🛠️ Tech Stack

### Core Technologies Used:
- **Frontend:** React, React Router, Axios, Chart.js, HTML5 Media APIs (getUserMedia, getDisplayMedia, MediaRecorder), Canvas API
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (with Mongoose ODM)
- **APIs:** Groq API
- **Hosting:** `[User Input Required: e.g., Vercel, Netlify, Heroku, AWS, Localhost]`

### Sponsor Technologies Used (if any):
- [✅] **Groq:** Used extensively for:
    - **Vision Analysis:** Analyzing combined webcam/screen images via Llama 4 Scout model to determine user focus, application, and activity.
    *   **LLM Chat:** Powering the AI Chat Assistant using Llama 3 model for contextual conversation based on user data.
    *   **Speech-to-Text:** Transcribing user audio messages via Whisper model for voice interaction with the chatbot.


---

## ✨ Key Features

Highlight the most important features of your project:

- ✅ **AI-Powered Focus Analysis:** Real-time determination of user focus state based on webcam (gaze direction) and screen content (work vs. non-work apps) using Groq Vision API.
- ✅ **Session Tracking & Management:** Start, stop, and automatically track focus/distraction time and application usage during dedicated sessions.
- ✅ **Interactive AI Chat Assistant:** Engage in text or voice conversations with an AI assistant that understands your productivity data (Today, Yesterday, Last Session, Current Status) and provides contextual insights and feedback.
- ✅ **Data Visualization & History:** View aggregated daily/session statistics (Focus Time, Focus %, App Usage) via charts and browse a detailed log of past sessions with inline details and app usage breakdowns.
- ✅ **Secure User Authentication:** Standard registration and login functionality using JWT for secure access to personal data and session tracking.
- ✅ **Real-time Feedback Loop:** Dashboard provides live updates on elapsed session time and the latest analysis results from the AI.

*(Consider adding screenshots/GIFs here showing the Dashboard, Chatbot, and Analytics page)*

---

## 📽️ Demo & Deliverables

- **Demo Video Link:** `[User Input Required: Paste YouTube or Loom link here]`
- **Pitch Deck / PPT Link:** `[User Input Required: Paste Google Slides / PDF link here]`

---

## ✅ Tasks & Bonus Checklist

- [ ] **All members of the team completed the mandatory task - Followed at least 2 of our social channels and filled the form** (Details in Participant Manual)
- [ ] **All members of the team completed Bonus Task 1 - Sharing of Badges and filled the form (2 points)** (Details in Participant Manual)
- [ ] **All members of the team completed Bonus Task 2 - Signing up for Sprint.dev and filled the form (3 points)** (Details in Participant Manual)

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

📈 Advanced Analytics: Implement weekly/monthly reports, identify long-term trends, and provide more granular insights into distraction triggers.

🎯 Goal Setting: Allow users to set focus goals (e.g., duration, percentage) and track progress.

✨ Personalized Recommendations: Suggest break times or focus techniques based on detected patterns of distraction.

📅 Integrations: Connect with calendar apps to automatically associate sessions with events or task management tools (e.g., Todoist, Jira).

🔔 Customizable Alerts: Allow users to configure alerts for prolonged distraction periods.

📱 Mobile Companion App: A simpler app for viewing stats and maybe starting/stopping sessions remotely.

🛡️ Security Enhancements: Implement refresh tokens, more robust input validation, and potential end-to-end encryption for chat (if needed).

🌐 Localization: Add support for multiple languages in the UI and potentially the chatbot interaction.

📎 Resources / Credits

Core Libraries: React, Node.js, Express.js, Mongoose, Axios, Chart.js, React Router DOM

Authentication/Security: jsonwebtoken, bcryptjs

AI Services: Groq Cloud API (groq-sdk)

Development Tools: dotenv, nodemon (likely used), cors, multer

Inspiration/Concepts: Productivity tracking tools, AI assistants.

🏁 Final Words

[User Input Required: Share your hackathon journey — challenges (e.g., prompt engineering, state synchronization, stream handling), key learnings (e.g., using vision models, real-time data flow), fun moments, or shout-outs to mentors/sponsors!]
