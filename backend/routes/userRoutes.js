// routes/userRoutes.js
const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
} = require("../controllers/userController");

const protect = require("../middleware/authMiddleware");

// @route   POST /api/users/register
// @desc    Register a new user
router.post("/register", registerUser);

// @route   POST /api/users/login
// @desc    Log in an existing user
router.post("/login", loginUser);

// @route   POST /api/users/logout
// @desc    Log out a user (protected route)
// Note: Token management is typically done on the client side,
// but you can still perform server-side tasks if needed.
router.post("/logout", protect, logoutUser);

// @route   GET /api/users/profile
// @desc    Get the profile of the logged-in user
router.get("/profile", protect, getUserProfile);

module.exports = router;
