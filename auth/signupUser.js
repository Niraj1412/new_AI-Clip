const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const { axiosWithProxy } = require("../utils/axiosWithProxy");
const User = require("../model/usersSchema");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

// Initialize Google OAuth2 client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Regular Sign-Up Function (Unchanged)
const signupUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Input validation
        if (!name || !email || !password) {
            return res.status(400).json({
                status: false,
                message: "All fields are required",
            });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                status: false,
                message: "Please provide a valid email address",
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({
                status: false,
                message: "Password must be at least 6 characters long",
            });
        }

        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                status: false,
                message: "Database connection unavailable. Please try again later.",
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email }).maxTimeMS(10000);
        if (existingUser) {
            return res.status(400).json({
                status: false,
                message: "User with this email already exists",
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            authProvider: "local",
        });

        // Save user
        await user.save({ maxTimeMS: 30000 });

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || "your_jwt_secret_key",
            { expiresIn: "24h" }
        );

        // Return success response (excluding sensitive data)
        res.status(201).json({
            status: true,
            message: "User registered successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                authProvider: user.authProvider,
            },
            token,
        });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({
            status: false,
            message: "Registration failed",
            error: err.message,
        });
    }
};

// Google Sign-Up Function (New)
const signupUserWithGoogle = async (req, res) => {
    try {
        const { token } = req.body;

        // Validate Google token presence
        if (!token) {
            return res.status(400).json({
                status: false,
                message: "Google token is required",
            });
        }

        // Verify the Google token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { email, name, picture, sub } = ticket.getPayload();

        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                status: false,
                message: "Database connection unavailable. Please try again later.",
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email }).maxTimeMS(10000);
        if (existingUser) {
            return res.status(400).json({
                status: false,
                message: "User with this email already exists. Please sign in instead.",
            });
        }

        // Create new user with Google details
        const user = new User({
            name,
            email,
            profilePicture: picture,
            googleId: sub,
            authProvider: "google",
            isGoogleUser: true,
        });

        // Save user
        await user.save({ maxTimeMS: 30000 });

        // Generate JWT token
        const jwtToken = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || "your_jwt_secret_key",
            { expiresIn: "24h" }
        );

        // Return success response
        res.status(201).json({
            status: true,
            message: "User signed up successfully with Google",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.profilePicture,
                authProvider: user.authProvider,
            },
            token: jwtToken,
        });
    } catch (err) {
        console.error("Google signup error:", err);
        res.status(500).json({
            status: false,
            message: "Google signup failed",
            error: err.message,
        });
    }
};

// Export both functions
module.exports = {
    signupUser,
    signupUserWithGoogle,
};