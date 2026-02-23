import mongoose from "mongoose";
import StaffPayment from "../models/StaffPayment.js";
import Staff from "../models/Staff.js";

const PAYMENT_TYPES = new Set(["advance", "payment", "adjustment"]);

const normalizeMonth = (month) => (typeof month === "string" ? month.trim() : "");

const buildBusinessFilter = (req) => {
  const filter = {};

  if (req.user?.role !== "developer" && req.user?.businessId) {
    filter.businessId = new mongoose.Types.ObjectId(req.user.businessId);
    return filter;
  }

  const businessId = req.query?.businessId || req.body?.businessId;
  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    filter.businessId = new mongoose.Types.ObjectId(businessId);
  }

  return filter;
};

export const createStaffPayment = async (req, res) => {
  try {
    const { staff_id, date, month, type } = req.body;
    const amount = Number(req.body.amount);
    const remarks = req.body.remarks ?? null;

    if (!mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Invalid staff_id" });
    }

    const normalizedMonth = normalizeMonth(month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
      return res.status(400).json({ message: "Month must be in YYYY-MM format" });
    }

    if (!PAYMENT_TYPES.has(type)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    if (!date || Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const businessFilter = buildBusinessFilter(req);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    const staffQuery = { _id: staff_id, ...businessFilter };
    const staff = await Staff.findOne(staffQuery).select("_id");
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const payment = await StaffPayment.create({
      staff_id,
      date: new Date(date),
      month: normalizedMonth,
      type,
      amount,
      remarks: typeof remarks === "string" ? remarks.trim() : remarks,
      businessId,
    });

    const populated = await StaffPayment.findById(payment._id).populate("staff_id", "name joining_date opening_balance");
    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("createStaffPayment:", err);
    return res.status(500).json({ message: "Failed to create staff payment" });
  }
};

export const getStaffPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      staff_id,
      type,
      month,
      date_from,
      date_to,
      name,
    } = req.query;

    const filter = buildBusinessFilter(req);

    if (staff_id && mongoose.Types.ObjectId.isValid(staff_id)) {
      filter.staff_id = new mongoose.Types.ObjectId(staff_id);
    }

    if (type && PAYMENT_TYPES.has(type)) {
      filter.type = type;
    }

    const normalizedMonth = normalizeMonth(month);
    if (normalizedMonth) {
      filter.month = normalizedMonth;
    }

    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to) filter.date.$lte = new Date(date_to);
    }

    if (name && name.trim()) {
      const staffFilter = {
        name: { $regex: name.trim(), $options: "i" },
      };
      if (filter.businessId) {
        staffFilter.businessId = filter.businessId;
      }

      const staffIds = await Staff.find(staffFilter).distinct("_id");
      if (filter.staff_id instanceof mongoose.Types.ObjectId) {
        filter.staff_id = staffIds.some((id) => id.equals(filter.staff_id))
          ? filter.staff_id
          : { $in: [] };
      } else {
        filter.staff_id = { $in: staffIds };
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 30, 1);
    const skip = (pageNum - 1) * limitNum;

    const [total, payments] = await Promise.all([
      StaffPayment.countDocuments(filter),
      StaffPayment.find(filter)
        .populate("staff_id", "name joining_date opening_balance")
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
    ]);

    return res.json({
      success: true,
      data: payments,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  } catch (err) {
    console.error("getStaffPayments:", err);
    return res.status(500).json({ message: "Failed to fetch staff payments" });
  }
};

export const getStaffPaymentStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);

    const [stats] = await StaffPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          advance: {
            $sum: {
              $cond: [{ $eq: ["$type", "advance"] }, 1, 0],
            },
          },
          payment: {
            $sum: {
              $cond: [{ $eq: ["$type", "payment"] }, 1, 0],
            },
          },
          adjustment: {
            $sum: {
              $cond: [{ $eq: ["$type", "adjustment"] }, 1, 0],
            },
          },
          total_amount: { $sum: "$amount" },
          total_advance_amount: {
            $sum: {
              $cond: [{ $eq: ["$type", "advance"] }, "$amount", 0],
            },
          },
          total_payment_amount: {
            $sum: {
              $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0],
            },
          },
          total_adjustment_amount: {
            $sum: {
              $cond: [{ $eq: ["$type", "adjustment"] }, "$amount", 0],
            },
          },
        },
      },
    ]);

    return res.json({
      success: true,
      data: stats || {
        total: 0,
        advance: 0,
        payment: 0,
        adjustment: 0,
        total_amount: 0,
        total_advance_amount: 0,
        total_payment_amount: 0,
        total_adjustment_amount: 0,
      },
    });
  } catch (err) {
    console.error("getStaffPaymentStats:", err);
    return res.status(500).json({ message: "Failed to fetch staff payment stats" });
  }
};

export const getStaffPaymentMonths = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);

    const months = await StaffPayment.distinct("month", filter);
    months.sort((a, b) => (a < b ? 1 : -1));

    return res.json({
      success: true,
      data: months,
    });
  } catch (err) {
    console.error("getStaffPaymentMonths:", err);
    return res.status(500).json({ message: "Failed to fetch staff payment months" });
  }
};
