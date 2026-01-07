import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true }, // Fast lookup
  refreshToken: { type: String, required: true }, // Store refresh token hash
  device: { type: String },
  os: { type: String },
  browser: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  lastActivity: { type: Date, default: Date.now }, // Track activity
  createdAt: { type: Date, default: Date.now },
  valid: { type: Boolean, default: true, index: true },
});

// TTL index: Auto-delete after 7 days of inactivity
sessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// Compound index for efficient queries
sessionSchema.index({ userId: 1, valid: 1 });

export default mongoose.model("Session", sessionSchema);