const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    // Add other fields later (phone, course, etc.)
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;