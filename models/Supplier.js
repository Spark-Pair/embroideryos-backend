import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    opening_balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

supplierSchema.index({ businessId: 1, name: 1 });

export default mongoose.model("Supplier", supplierSchema);
