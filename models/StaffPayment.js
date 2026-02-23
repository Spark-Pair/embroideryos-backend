import mongoose from "mongoose";

const staffPaymentSchema = new mongoose.Schema(
  {
    staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
    type: {
      type: String,
      enum: ["advance", "payment", "adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    remarks: {
      type: String,
      default: null,
      trim: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("StaffPayment", staffPaymentSchema);
