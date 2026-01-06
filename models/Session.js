import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: String, required: true, unique: true }, // Frontend/browser store
  device: { type: String },
  os: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
  valid: { type: Boolean, default: true }, // Logout ke liye
});

// TTL index: MongoDB automatically deletes the session 24 hours after `createdAt`
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model("Session", sessionSchema);
