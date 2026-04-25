import mongoose from "mongoose";

const stitchFormulaRuleSchema = new mongoose.Schema(
  {
    up_to: { type: Number, required: false, default: null },
    mode: { type: String, enum: ["fixed", "percent", "identity"], required: true, default: "identity" },
    value: { type: Number, required: false, default: 0 },
  },
  { _id: false }
);

const orderConfigSchema = new mongoose.Schema(
  {
    stitch_formula_enabled: { type: Boolean, required: false },
    stitch_formula_rules: { type: [stitchFormulaRuleSchema], required: false },
    effective_date: { type: Date, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
  },
  { timestamps: true }
);

orderConfigSchema.index({ businessId: 1, effective_date: 1 }, { unique: true });
orderConfigSchema.index({ businessId: 1, effective_date: -1 });

export default mongoose.model("OrderConfig", orderConfigSchema);
