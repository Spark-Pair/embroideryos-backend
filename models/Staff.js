import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "",
      index: true,
    },
    joining_date: {
      type: Date,
      required: true,
    },
    salary: {
      type: Number,
      required: false,
    },
    opening_balance: {
      type: Number,
      default: 0,
    },
    allowance_overrides: {
      type: [
        {
          month: { type: String, required: true, trim: true },
          mode: { type: String, enum: ["force_add", "force_remove"], required: true },
        },
      ],
      default: [],
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

customerSchema.index({ businessId: 1, isActive: 1, category: 1, name: 1 });

export default mongoose.model("Staff", customerSchema);
