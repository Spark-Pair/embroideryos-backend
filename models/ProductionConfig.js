import mongoose from "mongoose";

const productionConfigSchema = new mongoose.Schema(
  {
    stitch_rate:      { type: Number, required: false },
    applique_rate:    { type: Number, required: false },
    on_target_pct:    { type: Number, required: false },
    after_target_pct: { type: Number, required: false },
    pcs_per_round:    { type: Number, required: false },
    target_amount:    { type: Number, required: false },
    off_amount:       { type: Number, required: false },
    bonus_rate:       { type: Number, required: false },
    allowance:        { type: Number, required: false, default: 1500 },
    effective_date:   { type: Date, required: true, unique: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  },
  { timestamps: true }
);

productionConfigSchema.index({ effective_date: -1 });

export default mongoose.model("ProductionConfig", productionConfigSchema);
