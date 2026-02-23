import mongoose from "mongoose";

const productionRowSchema = new mongoose.Schema(
  {
    d_stitch:         { type: Number, required: true, min: 0 },
    applique:         { type: Number, default: 0, min: 0 },
    pcs:              { type: Number, required: true, min: 0 },
    rounds:           { type: Number, required: true, min: 0 },
    total_stitch:     { type: Number, required: true },
    on_target_amt:    { type: Number, required: true },
    after_target_amt: { type: Number, required: true },
  },
  { _id: false }
);

const productionTotalsSchema = new mongoose.Schema(
  {
    pcs:              { type: Number, default: 0 },
    rounds:           { type: Number, default: 0 },
    total_stitch:     { type: Number, default: 0 },
    on_target_amt:    { type: Number, default: 0 },
    after_target_amt: { type: Number, default: 0 },
  },
  { _id: false }
);

const staffRecordSchema = new mongoose.Schema(
  {
    staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    date:       { type: Date,   required: true },
    attendance: {
      type: String,
      enum: ["Day", "Night", "Half", "Absent", "Off", "Close", "Sunday"],
      required: true,
    },

    // ── Amount fields ───────────────────────────────────────────────────────────
    // final_amount: the effective amount for the day (after all rules applied)
    // If fix_amount is set → fix_amount overrides everything
    // Otherwise computed by attendance rules + salary/production logic
    final_amount: { type: Number, default: 0 },

    // Set by user to override all calculated amounts for the day
    fix_amount:   { type: Number, default: null },

    // Bonus
    bonus_qty:    { type: Number, default: 0 },   // how many bonuses
    bonus_rate:   { type: Number, default: null }, // per bonus amount (null = use config)
    bonus_amount: { type: Number, default: 0 },   // bonus_qty * effective_rate

    // ── Production ──────────────────────────────────────────────────────────────
    production: { type: [productionRowSchema], default: [] },
    totals:     { type: productionTotalsSchema,  default: null },

    // ── Config snapshot (locked at time of entry) ───────────────────────────────
    config_snapshot: {
      stitch_rate:      { type: Number },
      applique_rate:    { type: Number },
      on_target_pct:    { type: Number },
      after_target_pct: { type: Number },
      pcs_per_round:    { type: Number },
      target_amount:    { type: Number },
      off_amount:       { type: Number },
      bonus_rate:       { type: Number },
      allowance:        { type: Number },
    },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  },
  { timestamps: true }
);

staffRecordSchema.index({ staff_id: 1, date: 1 }, { unique: true });

export default mongoose.model("StaffRecord", staffRecordSchema);
