import mongoose from "mongoose";

const stitchFormulaRuleSchema = new mongoose.Schema(
  {
    up_to: { type: Number, required: false, default: null },
    mode: { type: String, enum: ["fixed", "percent", "identity"], required: true, default: "identity" },
    value: { type: Number, required: false, default: 0 },
  },
  { _id: false }
);

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
    stitch_formula_enabled: { type: Boolean, required: false, default: true },
    stitch_formula_rules: { type: [stitchFormulaRuleSchema], required: false, default: undefined },
    effective_date:   { type: Date, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  },
  { timestamps: true }
);

productionConfigSchema.index({ businessId: 1, effective_date: 1 }, { unique: true });
productionConfigSchema.index({ businessId: 1, effective_date: -1 });

export default mongoose.model("ProductionConfig", productionConfigSchema);
