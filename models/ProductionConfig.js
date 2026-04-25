import mongoose from "mongoose";
import { DEFAULT_PAYOUT_MODE } from "../utils/productionPayout.js";

const productionConfigSchema = new mongoose.Schema(
  {
    payout_mode:      { type: String, required: true, default: DEFAULT_PAYOUT_MODE },
    stitch_rate:      { type: Number, required: false },
    applique_rate:    { type: Number, required: false },
    on_target_pct:    { type: Number, required: false },
    after_target_pct: { type: Number, required: false },
    production_pct:   { type: Number, required: false },
    stitch_block_size:{ type: Number, required: false },
    amount_per_block: { type: Number, required: false },
    pcs_per_round:    { type: Number, required: false },
    target_amount:    { type: Number, required: false },
    off_amount:       { type: Number, required: false },
    bonus_rate:       { type: Number, required: false },
    allowance:        { type: Number, required: false },
    stitch_cap:       { type: Number, required: false },
    effective_date:   { type: Date, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  },
  { timestamps: true }
);

productionConfigSchema.index({ businessId: 1, effective_date: 1 }, { unique: true });
productionConfigSchema.index({ businessId: 1, effective_date: -1 });

export default mongoose.model("ProductionConfig", productionConfigSchema);
