import mongoose from "mongoose";
import Order from "../models/Order.js";
import Staff from "../models/Staff.js";
import CrpRateConfig from "../models/CrpRateConfig.js";
import CrpStaffRecord from "../models/CrpStaffRecord.js";

const normalizeCategory = (value) => {
  return String(value || "").trim();
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
      order_date,
      order_description,
      staff_id,
      type_name,
      rate,
      quantity_dzn,
    } = req.body;
    const category = normalizeCategory(req.body.category);

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    if (!staff_id || !mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Valid staff is required" });
    }
    if (!category) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!type_name?.trim()) {
      return res.status(400).json({ message: "Type is required" });
    }

    const shouldResolveOrder = Boolean(order_id && mongoose.Types.ObjectId.isValid(order_id));

    const [order, staff, rateConfig] = await Promise.all([
      shouldResolveOrder ? Order.findOne({ _id: order_id, ...businessFilter }).lean() : Promise.resolve(null),
      Staff.findOne({ _id: staff_id, ...businessFilter }).select("_id name category").lean(),
      CrpRateConfig.findOne({
        category,
        type_name: type_name.trim(),
        isActive: true,
        ...businessFilter,
      }).lean(),
    ]);

    if (shouldResolveOrder && !order) return res.status(404).json({ message: "Order not found" });
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (!rateConfig) {
      return res.status(404).json({ message: "CRP category/type config not found or inactive" });
    }

    const resolvedDateRaw = order?.date || order_date;
    const resolvedDate = resolvedDateRaw ? new Date(resolvedDateRaw) : null;
    if (!resolvedDate || Number.isNaN(resolvedDate.getTime())) {
      return res.status(400).json({ message: "Valid order date is required" });
    }

    const orderQtyDzn = order
      ? (order.unit === "Pcs" ? toNum(order.quantity) / 12 : toNum(order.quantity))
      : 0;

    const resolvedQtyDzn = quantity_dzn === undefined || quantity_dzn === null || quantity_dzn === ""
      ? (order ? orderQtyDzn : 0)
      : toNum(quantity_dzn);

    if (resolvedQtyDzn <= 0) {
      return res.status(400).json({ message: "Quantity in dozen must be greater than 0" });
    }

    const resolvedRate = toNum(rate || rateConfig.rate);
    if (resolvedRate <= 0) {
      return res.status(400).json({ message: "Rate must be greater than 0" });
    }

    const totalAmount = resolvedQtyDzn * resolvedRate;
    const month = resolvedDate.toISOString().slice(0, 7);

    const record = await CrpStaffRecord.create({
      order_id: order?._id || null,
      order_date: resolvedDate,
      order_description: (order_description ?? order?.description ?? "").trim(),
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

export const updateCrpStaffRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      order_id,
      order_date,
      order_description,
      staff_id,
      type_name,
      rate,
      quantity_dzn,
    } = req.body;
    const category = normalizeCategory(req.body.category);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    const existing = await CrpStaffRecord.findOne({ _id: id, ...businessFilter });
    if (!existing) return res.status(404).json({ message: "CRP record not found" });

    const nextCategory = category || existing.category;
    const nextTypeName = (type_name || existing.type_name || "").trim();

    if (!nextCategory) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!nextTypeName) {
      return res.status(400).json({ message: "Type is required" });
    }

    const nextStaffId = staff_id || existing.staff_id;
    if (!nextStaffId || !mongoose.Types.ObjectId.isValid(nextStaffId)) {
      return res.status(400).json({ message: "Valid staff is required" });
    }

    const shouldResolveOrder = Boolean(order_id && mongoose.Types.ObjectId.isValid(order_id));
    const resolvedOrderId = shouldResolveOrder ? order_id : existing.order_id;

    const [order, staff, rateConfig] = await Promise.all([
      resolvedOrderId ? Order.findOne({ _id: resolvedOrderId, ...businessFilter }).lean() : Promise.resolve(null),
      Staff.findOne({ _id: nextStaffId, ...businessFilter }).select("_id name category").lean(),
      CrpRateConfig.findOne({
        category: nextCategory,
        type_name: nextTypeName,
        isActive: true,
        ...businessFilter,
      }).lean(),
    ]);

    if (resolvedOrderId && !order) return res.status(404).json({ message: "Order not found" });
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (!rateConfig) {
      return res.status(404).json({ message: "CRP category/type config not found or inactive" });
    }

    const resolvedDateRaw = order?.date || order_date || existing.order_date;
    const resolvedDate = resolvedDateRaw ? new Date(resolvedDateRaw) : null;
    if (!resolvedDate || Number.isNaN(resolvedDate.getTime())) {
      return res.status(400).json({ message: "Valid order date is required" });
    }

    const orderQtyDzn = order
      ? (order.unit === "Pcs" ? toNum(order.quantity) / 12 : toNum(order.quantity))
      : 0;

    const resolvedQtyDzn = quantity_dzn === undefined || quantity_dzn === null || quantity_dzn === ""
      ? (order ? orderQtyDzn : toNum(existing.quantity_dzn))
      : toNum(quantity_dzn);

    if (resolvedQtyDzn <= 0) {
      return res.status(400).json({ message: "Quantity in dozen must be greater than 0" });
    }

    const resolvedRate = toNum(rate || rateConfig.rate || existing.rate);
    if (resolvedRate <= 0) {
      return res.status(400).json({ message: "Rate must be greater than 0" });
    }

    const totalAmount = resolvedQtyDzn * resolvedRate;
    const month = resolvedDate.toISOString().slice(0, 7);

    existing.order_id = order?._id || null;
    existing.order_date = resolvedDate;
    existing.order_description = (order_description ?? order?.description ?? existing.order_description ?? "").trim();
    existing.quantity_dzn = resolvedQtyDzn;
    existing.staff_id = staff._id;
    existing.staff_name = staff.name;
    existing.category = nextCategory;
    existing.type_name = nextTypeName;
    existing.rate = resolvedRate;
    existing.total_amount = totalAmount;
    existing.month = month;

    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("updateCrpStaffRecord:", err);
    return res.status(500).json({ message: "Failed to update CRP staff record" });
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
    if (normalizedCategory) filter.category = normalizedCategory;
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
