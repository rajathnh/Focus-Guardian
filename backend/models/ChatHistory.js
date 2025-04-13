// models/ChatHistory.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the structure for individual messages within the chat history
const messageSchema = new Schema({
    role: {
        type: String,
        required: true,
        enum: ['user', 'assistant'] // Define possible roles
    },
    content: {
        type: String,
        required: true,
        trim: true // Remove leading/trailing whitespace
    },
    timestamp: {
        type: Date,
        default: Date.now // Automatically set the time when the message is created
    }
}, { _id: false }); // Don't create separate _id for each message subdocument

// Define the main ChatHistory schema
const chatHistorySchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId, // Link to the User model
        ref: 'User',                          // Reference the 'User' model
        required: true,
        index: true                           // Indexing userId is good for performance
    },
    systemMessage: {
        content: {
            type: String,
            required: true // Store the system prompt used for this chat session
        },
        timestamp: {
            type: Date,
            default: Date.now // Record when the system prompt was set/updated
        }
    },
    messages: [messageSchema], // Array to hold the sequence of user and assistant messages
    createdAt: {
        type: Date,
        default: Date.now // Record when the chat history document was first created
    },
    updatedAt: {
        type: Date,
        default: Date.now // Record when the chat history was last updated (e.g., new message added)
    }
}, {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } // Automatically manage createdAt and updatedAt fields
});

// Create and export the ChatHistory model
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

module.exports = ChatHistory;