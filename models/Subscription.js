// models/Subscription.js
import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, unique: true },
    plan: { type: String, enum: ["trial", "basic", "pro", "premium"], default: "trial" },
    status: { type: String, enum: ["trial", "active", "past_due", "canceled", "expired"], default: "trial" },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    canceledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

subscriptionSchema.index({ businessId: 1, plan: 1, status: 1 });

export default mongoose.model("Subscription", subscriptionSchema);
