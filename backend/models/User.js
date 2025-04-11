// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // Total productivity stats
  totalFocusTime: { type: Number, default: 0 }, // in seconds
  totalDistractionTime: { type: Number, default: 0 },
  appUsage: {
    type: Map,
    of: Number, // total time spent on each app (in seconds)
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
