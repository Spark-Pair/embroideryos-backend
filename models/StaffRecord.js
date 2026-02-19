import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true
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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("StaffRecord", customerSchema);
