import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    joining_date: {
      type: Date,
      required: true,
    },
    salary: {
      type: Number,
      required: false,
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

export default mongoose.model("Staff", customerSchema);
