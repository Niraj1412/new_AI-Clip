const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    stripePaymentIntentId: {
        type: String,
        required: true,
        unique: true
    },
    stripeCustomerId: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true // Amount in cents
    },
    currency: {
        type: String,
        default: 'usd'
    },
    status: {
        type: String,
        enum: ['succeeded', 'pending', 'failed', 'cancelled'],
        default: 'pending'
    },
    planType: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        required: true
    },
    billingType: {
        type: String,
        enum: ['one-time', 'subscription'],
        default: 'one-time'
    },
    stripeSubscriptionId: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient queries
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ stripeCustomerId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
