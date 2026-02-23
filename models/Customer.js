import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    person: {
      type: String,
      required: true,
      trim: true,
    },
    rate: {
      type: Number,
      required: true,
    },
    opening_balance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Customer", customerSchema);
