import mongoose from "mongoose";
import ProductionConfig from "../models/ProductionConfig.js";

const DEFAULT_STITCH_FORMULA_RULES = [
  { up_to: 4237, mode: "fixed", value: 5000 },
  { up_to: 10000, mode: "percent", value: 18 },
  { up_to: 50000, mode: "percent", value: 10 },
  { up_to: null, mode: "percent", value: 5 },
];

const toNum = (value) => {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeFormulaRules = (rawRules) => {
  if (!Array.isArray(rawRules)) return DEFAULT_STITCH_FORMULA_RULES;

  const clean = rawRules
    .map((rule = {}) => {
      const upToRaw = rule?.up_to;
      const up_to =
        upToRaw === "" || upToRaw == null ? null : Math.max(0, toNum(upToRaw));
      const mode = ["fixed", "percent", "identity"].includes(rule?.mode)
        ? rule.mode
        : "identity";
      const value = mode === "identity" ? 0 : Math.max(0, toNum(rule?.value));
      return { up_to, mode, value };
    })
    .sort((a, b) => {
      const av = a.up_to == null ? Number.POSITIVE_INFINITY : a.up_to;
      const bv = b.up_to == null ? Number.POSITIVE_INFINITY : b.up_to;
      return av - bv;
    });

  return clean.length ? clean : DEFAULT_STITCH_FORMULA_RULES;
};

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
    const {
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      allowance,
      stitch_formula_enabled,
      stitch_formula_rules,
      effective_date,
    } = req.body;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const config = await ProductionConfig.create({
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      allowance: allowance ?? 1500,
      stitch_formula_enabled: stitch_formula_enabled !== undefined ? Boolean(stitch_formula_enabled) : true,
      stitch_formula_rules: normalizeFormulaRules(stitch_formula_rules),
      effective_date,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("createProductionConfig:", err);
    return res.status(500).json({ message: "Failed to create config" });
  }
};

export const updateProductionConfig = async (req, res) => {
  try {
    const {
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      allowance,
      stitch_formula_enabled,
      stitch_formula_rules,
      effective_date,
    } = req.body;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const existing = await ProductionConfig.findOne(businessFilter).sort({ createdAt: -1 });

    if (existing) {
      if (stitch_rate !== undefined) existing.stitch_rate = stitch_rate;
      if (applique_rate !== undefined) existing.applique_rate = applique_rate;
      if (on_target_pct !== undefined) existing.on_target_pct = on_target_pct;
      if (after_target_pct !== undefined) existing.after_target_pct = after_target_pct;
      if (pcs_per_round !== undefined) existing.pcs_per_round = pcs_per_round;
      if (target_amount !== undefined) existing.target_amount = target_amount;
      if (off_amount !== undefined) existing.off_amount = off_amount;
      if (bonus_rate !== undefined) existing.bonus_rate = bonus_rate;
      if (allowance !== undefined) existing.allowance = allowance;
      if (stitch_formula_enabled !== undefined) existing.stitch_formula_enabled = Boolean(stitch_formula_enabled);
      if (stitch_formula_rules !== undefined) existing.stitch_formula_rules = normalizeFormulaRules(stitch_formula_rules);
      if (effective_date !== undefined) existing.effective_date = effective_date ? new Date(effective_date) : null;

      await existing.save();
      return res.json({ success: true, data: existing });
    }

    const config = await ProductionConfig.create({
      stitch_rate,
      applique_rate,
      on_target_pct,
      after_target_pct,
      pcs_per_round,
      target_amount,
      off_amount,
      bonus_rate,
      allowance: allowance ?? 1500,
      stitch_formula_enabled: stitch_formula_enabled !== undefined ? Boolean(stitch_formula_enabled) : true,
      stitch_formula_rules: normalizeFormulaRules(stitch_formula_rules),
      effective_date: effective_date ? new Date(effective_date) : null,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("updateProductionConfig:", err);
    return res.status(500).json({ message: "Failed to update config" });
  }
};
