import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customer_name: { type: String, required: true, trim: true },
    customer_base_rate: { type: Number, default: 0 },
    description: { type: String, default: "", trim: true },

    date: { type: Date, required: true, index: true },
    machine_no: { type: String, required: true, trim: true },
    lot_no: { type: String, default: "", trim: true },

    unit: { type: String, enum: ["Dzn", "Pcs"], default: "Dzn" },
    quantity: { type: Number, required: true, min: 0 },
    qt_pcs: { type: Number, default: 0, min: 0 },

    actual_stitches: { type: Number, default: 0, min: 0 },
    design_stitches: { type: Number, default: 0, min: 0 },
    apq: { type: Number, default: null, min: 0 },
    apq_chr: { type: Number, default: null, min: 0 },

    rate: { type: Number, default: 0, min: 0 },
    calculated_rate: { type: Number, default: 0, min: 0 },
    stitch_rate: { type: Number, default: 0, min: 0 },
    total_amount: { type: Number, default: 0, min: 0 },

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

orderSchema.index({ businessId: 1, date: -1, createdAt: -1 });

export default mongoose.model("Order", orderSchema);
