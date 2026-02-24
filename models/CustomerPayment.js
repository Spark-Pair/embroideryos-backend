import mongoose from "mongoose";

const customerPaymentSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customer_name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
    method: {
      type: String,
      enum: ["cash", "cheque", "slip", "online", "adjustment"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reference_no: {
      type: String,
      default: "",
      trim: true,
    },
    bank_name: {
      type: String,
      default: "",
      trim: true,
    },
    party_name: {
      type: String,
      default: "",
      trim: true,
    },
    cheque_date: {
      type: Date,
      default: null,
    },
    clear_date: {
      type: Date,
      default: null,
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

customerPaymentSchema.index({ businessId: 1, date: -1, createdAt: -1 });

export default mongoose.model("CustomerPayment", customerPaymentSchema);
