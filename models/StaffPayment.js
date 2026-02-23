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
    },
    type: {
      type: String,
      enum: ["advance", "payment", "adjustment"],
      required: true,
    },
    remarks: {
      type: String,
      default: "",
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
