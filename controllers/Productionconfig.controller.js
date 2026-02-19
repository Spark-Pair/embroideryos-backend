import ProductionConfig from "../models/ProductionConfig.js";

// ─── GET config ───────────────────────────────────────────────────────────────

export const getProductionConfig = async (req, res) => {
  try {
    let config = await ProductionConfig.findOne().sort({ createdAt: -1 }).lean();

    // Auto-create with defaults if none exists
    if (!config) {
      config = await ProductionConfig.create({});
    }

    res.json({ success: true, data: config });
  } catch (err) {
    console.error("getProductionConfig:", err);
    res.status(500).json({ message: "Failed to fetch config" });
  }
};

// ─── UPDATE config (upsert — always single document) ─────────────────────────

export const updateProductionConfig = async (req, res) => {
  try {
    const {
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      effective_date,
    } = req.body;

    const existing = await ProductionConfig.findOne().sort({ createdAt: -1 });

    if (existing) {
      if (stitch_rate      !== undefined) existing.stitch_rate      = stitch_rate;
      if (applique_rate    !== undefined) existing.applique_rate    = applique_rate;
      if (on_target_pct    !== undefined) existing.on_target_pct    = on_target_pct;
      if (after_target_pct !== undefined) existing.after_target_pct = after_target_pct;
      if (pcs_per_round    !== undefined) existing.pcs_per_round    = pcs_per_round;
      if (target_amount    !== undefined) existing.target_amount    = target_amount;
      if (effective_date   !== undefined) existing.effective_date   = effective_date ? new Date(effective_date) : null;

      await existing.save();
      return res.json({ success: true, data: existing });
    }

    // Create fresh if none exists
    const config = await ProductionConfig.create({
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      effective_date: effective_date ? new Date(effective_date) : null,
    });

    res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("updateProductionConfig:", err);
    res.status(500).json({ message: "Failed to update config" });
  }
};