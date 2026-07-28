import mongoose from "mongoose";
import ProductionConfig from "../models/ProductionConfig.js";
import { normalizeProductionConfig } from "../utils/productionPayout.js";

const isDuplicateEffectiveDateError = (err) =>
  Number(err?.code || 0) === 11000 && String(err?.message || "").includes("effective_date");

const resolveBusinessId = (req) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId || null;
  }
  return req.query?.businessId || req.body?.businessId || null;
};

const buildBusinessFilter = (req, allowEmptyForDeveloper = true) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    return allowEmptyForDeveloper && req.user?.role === "developer" ? {} : null;
  }
  if (!mongoose.Types.ObjectId.isValid(businessId)) return null;
  return { businessId: new mongoose.Types.ObjectId(businessId) };
};

export const getProductionConfig = async (req, res) => {
  try {
    const { date } = req.query;
    const query = buildBusinessFilter(req);
    if (!query) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    if (String(req.query?.all || "").toLowerCase() === "true") {
      const configs = await ProductionConfig.find(query).sort({ effective_date: -1, createdAt: -1 }).lean();
      return res.json({ success: true, data: configs });
    }

    let config = null;
    if (date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        config = await ProductionConfig.findOne({
          ...query,
          effective_date: { $lte: d },
        })
          .sort({ effective_date: -1, createdAt: -1 })
          .lean();
      }
    }

    if (!config) {
      config = await ProductionConfig.findOne(query)
        .sort({ effective_date: -1, createdAt: -1 })
        .lean();
    }

    if (!config) {
      const fallback = await ProductionConfig.findOne(query)
        .sort({ effective_date: 1 })
        .lean();
      return res.json({ success: true, data: fallback || {} });
    }

    return res.json({ success: true, data: config });
  } catch (err) {
    console.error("getProductionConfig:", err);
    return res.status(500).json({ message: "Failed to fetch config" });
  }
};

export const createProductionConfig = async (req, res) => {
  try {
    const payload = normalizeProductionConfig(req.body || {});
    const {
      payout_mode,
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      production_pct,
      stitch_block_size,
      amount_per_block,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      auto_bonus_mode,
      auto_bonus_threshold,
      auto_bonus_qty,
      auto_bonus_enabled,
      auto_bonus_rules,
      allowance,
      stitch_cap,
      effective_date,
    } = payload;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const config = await ProductionConfig.create({
      payout_mode,
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      production_pct,
      stitch_block_size,
      amount_per_block,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      auto_bonus_mode,
      auto_bonus_threshold,
      auto_bonus_qty,
      auto_bonus_enabled,
      auto_bonus_rules,
      allowance,
      stitch_cap,
      effective_date,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("createProductionConfig:", err);
    if (isDuplicateEffectiveDateError(err)) {
      return res.status(409).json({
        message: "A production config already exists for this effective date",
      });
    }
    return res.status(500).json({ message: "Failed to create config" });
  }
};

export const updateProductionConfig = async (req, res) => {
  try {
    const payload = normalizeProductionConfig(req.body || {});
    const {
      payout_mode,
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      production_pct,
      stitch_block_size,
      amount_per_block,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      auto_bonus_mode,
      auto_bonus_threshold,
      auto_bonus_qty,
      auto_bonus_enabled,
      auto_bonus_rules,
      allowance,
      stitch_cap,
      effective_date,
    } = payload;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const requestedId = req.params?.id || req.body?._id || req.body?.id;
    const existing = requestedId && mongoose.Types.ObjectId.isValid(requestedId)
      ? await ProductionConfig.findOne({ _id: requestedId, ...businessFilter })
      : await ProductionConfig.findOne(businessFilter).sort({ createdAt: -1 });

    if (requestedId && !existing) return res.status(404).json({ message: "Production config not found" });

    if (existing) {
      if (payout_mode !== undefined) existing.payout_mode = payout_mode;
      if (stitch_rate !== undefined) existing.stitch_rate = stitch_rate;
      if (applique_rate !== undefined) existing.applique_rate = applique_rate;
      if (on_target_pct !== undefined) existing.on_target_pct = on_target_pct;
      if (after_target_pct !== undefined) existing.after_target_pct = after_target_pct;
      if (production_pct !== undefined) existing.production_pct = production_pct;
      if (stitch_block_size !== undefined) existing.stitch_block_size = stitch_block_size;
      if (amount_per_block !== undefined) existing.amount_per_block = amount_per_block;
      if (pcs_per_round !== undefined) existing.pcs_per_round = pcs_per_round;
      if (target_amount !== undefined) existing.target_amount = target_amount;
      if (off_amount !== undefined) existing.off_amount = off_amount;
      if (bonus_rate !== undefined) existing.bonus_rate = bonus_rate;
      if (auto_bonus_mode !== undefined) existing.auto_bonus_mode = auto_bonus_mode;
      if (auto_bonus_threshold !== undefined) existing.auto_bonus_threshold = auto_bonus_threshold;
      if (auto_bonus_qty !== undefined) existing.auto_bonus_qty = auto_bonus_qty;
      if (auto_bonus_enabled !== undefined) existing.auto_bonus_enabled = auto_bonus_enabled;
      if (auto_bonus_rules !== undefined) existing.auto_bonus_rules = auto_bonus_rules;
      if (allowance !== undefined) existing.allowance = allowance;
      if (stitch_cap !== undefined) existing.stitch_cap = stitch_cap;
      if (effective_date !== undefined) existing.effective_date = effective_date ? new Date(effective_date) : null;

      await existing.save();
      return res.json({ success: true, data: existing });
    }

    const config = await ProductionConfig.create({
      payout_mode,
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      production_pct,
      stitch_block_size,
      amount_per_block,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      auto_bonus_mode,
      auto_bonus_threshold,
      auto_bonus_qty,
      auto_bonus_enabled,
      auto_bonus_rules,
      allowance,
      stitch_cap,
      effective_date: effective_date ? new Date(effective_date) : null,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("updateProductionConfig:", err);
    if (isDuplicateEffectiveDateError(err)) {
      return res.status(409).json({
        message: "A production config already exists for this effective date",
      });
    }
    return res.status(500).json({ message: "Failed to update config" });
  }
};
