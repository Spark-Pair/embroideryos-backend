import mongoose from "mongoose";
import OrderConfig from "../models/OrderConfig.js";

const toNum = (value) => {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeFormulaRules = (rawRules) => {
  if (!Array.isArray(rawRules)) return [];

  return rawRules
    .map((rule = {}) => {
      const upToRaw = rule?.up_to;
      const up_to = upToRaw === "" || upToRaw == null ? null : Math.max(0, toNum(upToRaw));
      const mode = ["fixed", "percent", "identity"].includes(rule?.mode) ? rule.mode : "identity";
      const value = mode === "identity" ? 0 : Math.max(0, toNum(rule?.value));
      return { up_to, mode, value };
    })
    .sort((a, b) => {
      const av = a.up_to == null ? Number.POSITIVE_INFINITY : a.up_to;
      const bv = b.up_to == null ? Number.POSITIVE_INFINITY : b.up_to;
      return av - bv;
    });
};

const resolveBusinessId = (req) => {
  if (req.user?.role !== "developer") return req.user?.businessId || null;
  return req.query?.businessId || req.body?.businessId || null;
};

const buildBusinessFilter = (req, allowEmptyForDeveloper = true) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) return allowEmptyForDeveloper && req.user?.role === "developer" ? {} : null;
  if (!mongoose.Types.ObjectId.isValid(businessId)) return null;
  return { businessId: new mongoose.Types.ObjectId(businessId) };
};

export const getOrderConfig = async (req, res) => {
  try {
    const { date } = req.query;
    const query = buildBusinessFilter(req);
    if (!query) return res.status(400).json({ message: "Invalid businessId" });

    let config = null;
    if (date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        config = await OrderConfig.findOne({
          ...query,
          effective_date: { $lte: d },
        }).sort({ effective_date: -1, createdAt: -1 }).lean();
      }
    }

    if (!config) {
      config = await OrderConfig.findOne(query).sort({ effective_date: -1, createdAt: -1 }).lean();
    }

    return res.json({ success: true, data: config || {} });
  } catch (err) {
    console.error("getOrderConfig:", err);
    return res.status(500).json({ message: "Failed to fetch order config" });
  }
};

export const createOrderConfig = async (req, res) => {
  try {
    const {
      stitch_formula_enabled,
      stitch_formula_rules,
      effective_date,
    } = req.body;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) return res.status(400).json({ message: "Valid businessId is required" });

    const config = await OrderConfig.create({
      stitch_formula_enabled: stitch_formula_enabled !== undefined ? Boolean(stitch_formula_enabled) : undefined,
      stitch_formula_rules: normalizeFormulaRules(stitch_formula_rules),
      effective_date,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("createOrderConfig:", err);
    return res.status(500).json({ message: "Failed to create order config" });
  }
};

export const updateOrderConfig = async (req, res) => {
  try {
    const {
      stitch_formula_enabled,
      stitch_formula_rules,
      effective_date,
    } = req.body;

    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) return res.status(400).json({ message: "Valid businessId is required" });

    const existing = await OrderConfig.findOne(businessFilter).sort({ createdAt: -1 });

    if (existing) {
      if (stitch_formula_enabled !== undefined) existing.stitch_formula_enabled = Boolean(stitch_formula_enabled);
      if (stitch_formula_rules !== undefined) existing.stitch_formula_rules = normalizeFormulaRules(stitch_formula_rules);
      if (effective_date !== undefined) existing.effective_date = effective_date ? new Date(effective_date) : null;
      await existing.save();
      return res.json({ success: true, data: existing });
    }

    const config = await OrderConfig.create({
      stitch_formula_enabled: stitch_formula_enabled !== undefined ? Boolean(stitch_formula_enabled) : undefined,
      stitch_formula_rules: normalizeFormulaRules(stitch_formula_rules),
      effective_date: effective_date ? new Date(effective_date) : null,
      businessId: businessFilter.businessId,
    });

    return res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error("updateOrderConfig:", err);
    return res.status(500).json({ message: "Failed to update order config" });
  }
};
