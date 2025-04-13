const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes (to be created later)
const userRoutes = require("./routes/userRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const chatRoutes = require('./routes/chatRoutes');

app.use("/api/users", userRoutes);
app.use("/api/sessions", sessionRoutes);
app.use('/api/chat', chatRoutes); 

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
