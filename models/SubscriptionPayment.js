import mongoose from "mongoose";

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["trial", "basic", "pro", "premium"],
      required: true,
      default: "trial",
    },
    payment_date: {
      type: Date,
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: ["cash", "bank", "online", "cheque"],
      default: "online",
    },
    status: {
      type: String,
      enum: ["received", "pending", "failed", "refunded"],
      default: "received",
      index: true,
    },
    reference_no: {
      type: String,
      default: "",
      trim: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
    received_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

subscriptionPaymentSchema.index({ payment_date: -1, createdAt: -1 });

export default mongoose.model("SubscriptionPayment", subscriptionPaymentSchema);
