const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const User = require('../models/User'); // Import User model
const OTP = require('../models/OTP');   // Import OTP model

// --- Helper Functions (same as before) ---
function generateOTP() {
    return otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false });
}

async function sendOTP(email, otp) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_PORT == 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP for Project Achilles',
        text: `Your OTP is: ${otp}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('OTP email sent to:', email);
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw error;
    }
}

// --- Route Handlers (Modified for MongoDB) ---

// 1. Send OTP
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    try {
        const otp = generateOTP();
        await sendOTP(email, otp);

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Use findOneAndUpdate to upsert (update if exists, insert if not)
        await OTP.findOneAndUpdate(
            { email },
            { otp, expiresAt },
            { upsert: true, new: true } // options: upsert and return the updated document
        );

        res.status(200).json({ message: 'OTP sent successfully' });

    } catch (error) {
        console.error('Error in /send-otp:', error);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

// 2. Register User
router.post('/register', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    try {
        // Find OTP and check for expiration
        const otpRecord = await OTP.findOne({ email, otp });

        if (!otpRecord) {
            return res.status(401).json({ message: 'Invalid OTP' });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(401).json({ message: 'OTP has expired' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists' });
        }

        // Create new user
        const newUser = new User({ email });
        await newUser.save();

        // Generate JWT
        const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: '30m' });

        // Delete OTP record
        await OTP.deleteOne({ email });

        res.status(201).json({ message: 'User registered successfully', token, user: { id: newUser._id, email: newUser.email } });

    } catch (error) {
        console.error('Error in /register:', error);
        res.status(500).json({ message: 'Failed to register user' });
    }
});

// 3. Login User
router.post('/login', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
      }

      try {
          // Find OTP and check for expiration
          const otpRecord = await OTP.findOne({ email, otp });

          if (!otpRecord) {
              return res.status(401).json({ message: 'Invalid OTP' });
          }

          if (otpRecord.expiresAt < new Date()) {
              return res.status(401).json({ message: 'OTP has expired' });
          }

          // Check if user exists
          const user = await User.findOne({ email });
          if (!user) {
              return res.status(404).json({ message: 'User not found' });
          }

            // Generate JWT
            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30m' });

            // Delete the OTP record
            await OTP.deleteOne({ email });

            res.status(200).json({ message: 'Login successful', token, user: { id: user._id, email: user.email } });

        } catch (error) {
            console.error('Error in /login:', error);
            res.status(500).json({ message: 'Failed to login user' });
        }
});

// 4. Admin Login
router.post('/admin/login', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    try {
        // Find OTP and check for expiration
        const otpRecord = await OTP.findOne({ email, otp });

        if (!otpRecord) {
            return res.status(401).json({ message: 'Invalid OTP' });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(401).json({ message: 'OTP has expired' });
        }

        // Check if user exists AND is an admin
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.isAdmin) { // Check the isAdmin flag
            return res.status(403).json({ message: 'Unauthorized' }); // 403 Forbidden
        }

        // Generate JWT
        const token = jwt.sign({ userId: user._id, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '30m' });

        // Delete the OTP record
        await OTP.deleteOne({ email });

        res.status(200).json({ message: 'Admin login successful', token, user: { id: user._id, email: user.email, isAdmin: user.isAdmin } });

    } catch (error) {
        console.error('Error in /admin/login:', error);
        res.status(500).json({ message: 'Failed to login admin' });
    }
});
module.exports = router;