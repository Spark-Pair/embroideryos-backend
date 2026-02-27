import mongoose from "mongoose";
import Order from "../models/Order.js";
import Staff from "../models/Staff.js";
import CrpRateConfig from "../models/CrpRateConfig.js";
import CrpStaffRecord from "../models/CrpStaffRecord.js";

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

export const createCrpStaffRecord = async (req, res) => {
  try {
    const {
      order_id,
      staff_id,
      type_name,
      rate,
      quantity_dzn,
    } = req.body;
    const category = normalizeCategory(req.body.category);

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({ message: "Valid order is required" });
    }
    if (!staff_id || !mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Valid staff is required" });
    }
    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!type_name?.trim()) {
      return res.status(400).json({ message: "Type is required" });
    }

    const [order, staff, rateConfig] = await Promise.all([
      Order.findOne({ _id: order_id, ...businessFilter }).lean(),
      Staff.findOne({ _id: staff_id, ...businessFilter }).select("_id name category").lean(),
      CrpRateConfig.findOne({
        category,
        type_name: type_name.trim(),
        isActive: true,
        ...businessFilter,
      }).lean(),
    ]);

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (staff.category !== "Cropping") {
      return res.status(400).json({ message: "Selected staff is not in Cropping category" });
    }
    if (!rateConfig) {
      return res.status(404).json({ message: "CRP category/type config not found or inactive" });
    }

    const existingRecord = await CrpStaffRecord.findOne({
      order_id: order._id,
      ...businessFilter,
    })
      .select("_id")
      .lean();
    if (existingRecord) {
      return res.status(409).json({ message: "CRP record already exists for this order" });
    }

    const orderQtyDzn = order.unit === "Pcs"
      ? toNum(order.quantity) / 12
      : toNum(order.quantity);

    const resolvedQtyDzn = quantity_dzn === undefined || quantity_dzn === null || quantity_dzn === ""
      ? orderQtyDzn
      : toNum(quantity_dzn);

    if (resolvedQtyDzn <= 0) {
      return res.status(400).json({ message: "Quantity in dozen must be greater than 0" });
    }

    const resolvedRate = toNum(rate || rateConfig.rate);
    if (resolvedRate <= 0) {
      return res.status(400).json({ message: "Rate must be greater than 0" });
    }

    const totalAmount = resolvedQtyDzn * resolvedRate;
    const month = new Date(order.date).toISOString().slice(0, 7);

    const record = await CrpStaffRecord.create({
      order_id: order._id,
      order_date: order.date,
      order_description: order.description || "",
      quantity_dzn: resolvedQtyDzn,
      staff_id: staff._id,
      staff_name: staff.name,
      category,
      type_name: type_name.trim(),
      rate: resolvedRate,
      total_amount: totalAmount,
      month,
      businessId,
    });

    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("createCrpStaffRecord:", err);
    return res.status(500).json({ message: "Failed to create CRP staff record" });
  }
};

export const getCrpStaffRecords = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      month,
      staff_id,
      category,
      type_name,
      date_from,
      date_to,
      businessId,
    } = req.query;
    const normalizedCategory = normalizeCategory(category);

    const filter = { ...buildBusinessFilter(req, businessId) };

    if (month?.trim()) filter.month = month.trim();
    if (staff_id && mongoose.Types.ObjectId.isValid(staff_id)) {
      filter.staff_id = new mongoose.Types.ObjectId(staff_id);
    }
    if (normalizedCategory && CATEGORIES.has(normalizedCategory)) filter.category = normalizedCategory;
    if (type_name?.trim()) filter.type_name = { $regex: type_name.trim(), $options: "i" };

    if (date_from || date_to) {
      filter.order_date = {};
      if (date_from) filter.order_date.$gte = new Date(date_from);
      if (date_to) filter.order_date.$lte = new Date(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await CrpStaffRecord.countDocuments(filter);
    const data = await CrpStaffRecord.find(filter)
      .populate("staff_id", "name category")
      .populate("order_id", "description date quantity unit")
      .sort({ order_date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    return res.json({
      success: true,
      data,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
    });
  } catch (err) {
    console.error("getCrpStaffRecords:", err);
    return res.status(500).json({ message: "Failed to fetch CRP staff records" });
  }
};

export const getCrpStaffRecordStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);

    const [stats] = await CrpStaffRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_records: { $sum: 1 },
          total_quantity_dzn: { $sum: "$quantity_dzn" },
          total_amount: { $sum: "$total_amount" },
        },
      },
    ]);

    return res.json({
      success: true,
      data: stats || { total_records: 0, total_quantity_dzn: 0, total_amount: 0 },
    });
  } catch (err) {
    console.error("getCrpStaffRecordStats:", err);
    return res.status(500).json({ message: "Failed to fetch CRP record stats" });
  }
};

export const deleteCrpStaffRecord = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);
    const record = await CrpStaffRecord.findOneAndDelete({ _id: req.params.id, ...filter });
    if (!record) return res.status(404).json({ message: "CRP staff record not found" });
    return res.json({ success: true, id: record._id });
  } catch (err) {
    console.error("deleteCrpStaffRecord:", err);
    return res.status(500).json({ message: "Failed to delete CRP staff record" });
  }
};
