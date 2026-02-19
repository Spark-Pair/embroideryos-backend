import mongoose from "mongoose";

const productionConfigSchema = new mongoose.Schema(
  {
    stitch_rate:      { type: Number, required: true, default: 0.001 },
    applique_rate:    { type: Number, required: true, default: 1.111 },
    on_target_pct:    { type: Number, required: true, default: 30 },
    after_target_pct: { type: Number, required: true, default: 39 },
    pcs_per_round:    { type: Number, required: true, default: 12 },
    target_amount:    { type: Number, required: true, default: 1000 },
    off_amount:       { type: Number, required: true, default: 0 },
    bonus_rate:       { type: Number, required: true, default: 200 },
    // Each document = one config version.
    // To resolve config for a date: find effective_date <= date, sort desc, take first.
    effective_date:   { type: Date, required: true, default: () => new Date("2000-01-01") },
  },
  { timestamps: true }
);

productionConfigSchema.index({ effective_date: -1 });

export default mongoose.model("ProductionConfig", productionConfigSchema);