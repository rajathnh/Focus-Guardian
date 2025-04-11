// models/Session.js
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },

  focusTime: { type: Number, default: 0 }, // seconds focused
  distractionTime: { type: Number, default: 0 }, // seconds distracted

  appUsage: {
    type: Map,
    of: Number, // in seconds
    default: {}
  },
  lastApiCallTimestamp: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Session", sessionSchema);
