const express = require('express');
const { handleChatMessage } = require('../controllers/chatController'); // Create this controller

const router = express.Router();

// Import the authentication middleware
// Make sure the path '../middleware/authMiddleware' is correct for your project structure
const protect = require('../middleware/authMiddleware');

// Define the route for handling chat messages
// POST request to the root of this router (which will be mounted at /api/chat)
// It first runs 'protect' to ensure the user is logged in,
// then it runs 'handleChatMessage' to process the request.
router.post('/', protect, handleChatMessage);

// Export the router so it can be used in your main server file
module.exports = router;