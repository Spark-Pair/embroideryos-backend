import mongoose from "mongoose";
import CrpRateConfig from "../models/CrpRateConfig.js";

const CATEGORIES = new Set(["Press", "Cropping", "Other"]);

const normalizeCategory = (value) => {
  const category = String(value || "").trim();
  if (category === "Packing") return "Cropping";
  return category;
};

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const buildBusinessFilter = (req, businessId) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId
      ? { businessId: new mongoose.Types.ObjectId(req.user.businessId) }
      : {};
  }
  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    return { businessId: new mongoose.Types.ObjectId(businessId) };
  }
  return {};
};

export const createCrpRateConfig = async (req, res) => {
  try {
    const { type_name, rate } = req.body;
    const category = normalizeCategory(req.body.category);

    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!type_name?.trim()) {
      return res.status(400).json({ message: "Type is required" });
    }

    const parsedRate = toNum(rate);
    if (parsedRate <= 0) {
      return res.status(400).json({ message: "Rate must be greater than 0" });
    }

    const item = await CrpRateConfig.create({
      category,
      type_name: type_name.trim(),
      rate: parsedRate,
      businessId: req.body.businessId,
    });

    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "This category + type already exists" });
    }
    console.error("createCrpRateConfig:", err);
    return res.status(500).json({ message: "Failed to create CRP rate config" });
  }
};

export const getCrpRateConfigs = async (req, res) => {
  try {
    const { status, type_name, businessId } = req.query;
    const category = normalizeCategory(req.query.category);

    const filter = { ...buildBusinessFilter(req, businessId) };

    if (category && CATEGORIES.has(category)) filter.category = category;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (type_name?.trim()) filter.type_name = { $regex: type_name.trim(), $options: "i" };

    const data = await CrpRateConfig.find(filter).sort({ category: 1, type_name: 1 }).lean();

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getCrpRateConfigs:", err);
    return res.status(500).json({ message: "Failed to fetch CRP rate configs" });
  }
};

export const updateCrpRateConfig = async (req, res) => {
  try {
    const { type_name, rate } = req.body;
    const nextCategory = normalizeCategory(req.body.category);

    const item = await CrpRateConfig.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "CRP rate config not found" });

    if (req.body.category !== undefined) {
      if (!CATEGORIES.has(nextCategory)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      item.category = nextCategory;
    }

    if (type_name !== undefined) {
      if (!String(type_name).trim()) {
        return res.status(400).json({ message: "Type is required" });
      }
      item.type_name = String(type_name).trim();
    }

    if (rate !== undefined) {
      const parsedRate = toNum(rate);
      if (parsedRate <= 0) {
        return res.status(400).json({ message: "Rate must be greater than 0" });
      }
      item.rate = parsedRate;
    }

    await item.save();
    return res.json({ success: true, data: item });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "This category + type already exists" });
    }
    console.error("updateCrpRateConfig:", err);
    return res.status(500).json({ message: "Failed to update CRP rate config" });
  }
};

export const toggleCrpRateConfigStatus = async (req, res) => {
  try {
    const item = await CrpRateConfig.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "CRP rate config not found" });

    item.isActive = !item.isActive;
    await item.save();

    return res.json({ success: true, id: item._id, isActive: item.isActive });
  } catch (err) {
    console.error("toggleCrpRateConfigStatus:", err);
    return res.status(500).json({ message: "Failed to toggle CRP rate config status" });
  }
};
