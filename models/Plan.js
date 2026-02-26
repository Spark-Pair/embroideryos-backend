import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0, default: 0 },
    durationDays: { type: Number, required: true, min: 1, default: 30 },
    features: {
      invoice_banner: { type: Boolean, default: false },
      invoice_image_upload: { type: Boolean, default: false },
    },
    limits: {
      users: { type: Number, default: 1, min: 1 },
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

planSchema.index({ isActive: 1, sortOrder: 1, id: 1 });

export default mongoose.model("Plan", planSchema);
