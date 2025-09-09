const mongoose = require("mongoose");

const usersSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    profilePicture: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    savedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    likedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "PublishedVideo" }],
    publishedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "PublishedVideo" }],
    
    // Auth provider fields
    authProvider: { type: String, enum: ['local', 'google', 'github', 'twitter'], default: 'local' },
    isGoogleUser: { type: Boolean, default: false },
    isGithubUser: { type: Boolean, default: false },
    isTwitterUser: { type: Boolean, default: false },
    
    // OAuth provider specific fields
    googleId: { type: String },
    githubId: { type: String },
    twitterId: { type: String },
    
    // For account recovery
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },

    // Stripe subscription fields
    stripeCustomerId: { type: String },
    subscriptionId: { type: String },
    subscriptionStatus: {
        type: String,
        enum: ['active', 'inactive', 'cancelled', 'past_due', 'canceling'],
        default: 'inactive'
    },
    planType: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        default: 'free'
    },
    lastPaymentDate: { type: Date },

    // Usage tracking for free users
    usageTracking: {
        clipsThisMonth: { type: Number, default: 0 },
        lastUsageReset: { type: Date, default: Date.now },
        totalClipsGenerated: { type: Number, default: 0 }
    }
});

// Add methods to the schema for usage tracking
usersSchema.methods.resetMonthlyUsage = function() {
    const now = new Date();
    const lastReset = this.usageTracking.lastUsageReset;
    const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));

    // Reset if it's been more than 30 days
    if (daysSinceReset >= 30) {
        this.usageTracking.clipsThisMonth = 0;
        this.usageTracking.lastUsageReset = now;
        return true;
    }
    return false;
};

usersSchema.methods.canGenerateClip = function() {
    this.resetMonthlyUsage(); // Check and reset if needed

    const FREE_USER_LIMITS = {
        monthlyClips: 5,
        maxDurationSeconds: 300, // 5 minutes
        maxQuality: '720p'
    };

    if (this.planType === 'free') {
        return {
            allowed: this.usageTracking.clipsThisMonth < FREE_USER_LIMITS.monthlyClips,
            remainingClips: Math.max(0, FREE_USER_LIMITS.monthlyClips - this.usageTracking.clipsThisMonth),
            limits: FREE_USER_LIMITS
        };
    }

    // Paid users have no limits
    return {
        allowed: true,
        remainingClips: -1, // Unlimited
        limits: null
    };
};

usersSchema.methods.incrementClipUsage = function() {
    this.usageTracking.clipsThisMonth += 1;
    this.usageTracking.totalClipsGenerated += 1;
};

module.exports = mongoose.model("User", usersSchema);
