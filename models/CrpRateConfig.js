import mongoose from "mongoose";

const crpRateConfigSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["Press", "Cropping", "Other"],
      required: true,
      index: true,
    },
    type_name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

crpRateConfigSchema.index({ businessId: 1, category: 1, type_name: 1 }, { unique: true });

export default mongoose.model("CrpRateConfig", crpRateConfigSchema);
