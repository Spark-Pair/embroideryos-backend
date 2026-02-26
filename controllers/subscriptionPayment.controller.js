import mongoose from "mongoose";
import SubscriptionPayment from "../models/SubscriptionPayment.js";
import Business from "../models/Business.js";
import Subscription from "../models/Subscription.js";
import { getPlanById } from "../services/plan.service.js";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const toMonthKey = (dateInput) => {
  const d = new Date(dateInput);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const toStartOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toEndOfDay = (value) => {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const getSubscriptionPayments = async (req, res) => {
  try {
    const { page = 1, limit = 30, month, businessId, status, plan, date_from, date_to } = req.query;
    const filter = {};

    if (month && MONTH_REGEX.test(month)) filter.month = month;
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      filter.businessId = new mongoose.Types.ObjectId(businessId);
    }
    if (date_from || date_to) {
      filter.payment_date = {};
      if (date_from) filter.payment_date.$gte = toStartOfDay(date_from);
      if (date_to) filter.payment_date.$lte = toEndOfDay(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await SubscriptionPayment.countDocuments(filter);
    const rows = await SubscriptionPayment.find(filter)
      .sort({ payment_date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const businessIds = [...new Set(rows.map((r) => String(r.businessId)).filter(Boolean))];
    const businesses = await Business.find({ _id: { $in: businessIds } }).select("name").lean();
    const businessMap = new Map(businesses.map((b) => [String(b._id), b.name]));

    const data = rows.map((row) => ({
      ...row,
      business_name: businessMap.get(String(row.businessId)) || "",
    }));

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
    console.error("getSubscriptionPayments:", err);
    return res.status(500).json({ message: "Failed to fetch subscription payments" });
  }
};

export const getSubscriptionPaymentStats = async (req, res) => {
  try {
    const month = MONTH_REGEX.test(req.query?.month || "") ? req.query.month : toMonthKey(new Date());
    const monthFilter = { month };

    const [overallAgg, monthAgg, activeSubs, expiringSoon] = await Promise.all([
      SubscriptionPayment.aggregate([
        { $match: { status: "received" } },
        { $group: { _id: null, total_received: { $sum: "$amount" }, total_count: { $sum: 1 } } },
      ]),
      SubscriptionPayment.aggregate([
        { $match: monthFilter },
        {
          $group: {
            _id: null,
            month_received: { $sum: { $cond: [{ $eq: ["$status", "received"] }, "$amount", 0] } },
            month_pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
            month_total_count: { $sum: 1 },
          },
        },
      ]),
      Subscription.countDocuments({ status: { $in: ["trial", "active", "past_due"] }, active: true }),
      Subscription.countDocuments({
        active: true,
        expiresAt: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        month,
        total_received: Number(overallAgg?.[0]?.total_received || 0),
        total_count: Number(overallAgg?.[0]?.total_count || 0),
        month_received: Number(monthAgg?.[0]?.month_received || 0),
        month_pending: Number(monthAgg?.[0]?.month_pending || 0),
        month_total_count: Number(monthAgg?.[0]?.month_total_count || 0),
        active_subscriptions: Number(activeSubs || 0),
        expiring_7_days: Number(expiringSoon || 0),
      },
    });
  } catch (err) {
    console.error("getSubscriptionPaymentStats:", err);
    return res.status(500).json({ message: "Failed to fetch payment stats" });
  }
};

export const createSubscriptionPayment = async (req, res) => {
  try {
    const {
      businessId,
      plan,
      payment_date,
      month,
      amount,
      method,
      status,
      reference_no,
      remarks,
    } = req.body;

    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }
    if (!payment_date) return res.status(400).json({ message: "payment_date is required" });
    if (amount === undefined || amount === null || Number(amount) < 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const resolvedMonth = MONTH_REGEX.test(month || "") ? month : toMonthKey(payment_date);

    const resolvedPlan = await getPlanById(plan || "trial");
    const payment = await SubscriptionPayment.create({
      businessId,
      plan: resolvedPlan?.id || "trial",
      payment_date: new Date(payment_date),
      month: resolvedMonth,
      amount: Number(amount),
      method: method || "online",
      status: status || "received",
      reference_no: reference_no || "",
      remarks: remarks || "",
      received_by: req.user?._id || null,
    });

    if (payment.status === "received") {
      const durationDays = Number(resolvedPlan?.durationDays || 30);
      const existing = await Subscription.findOne({ businessId });
      const baseDate =
        existing?.expiresAt && existing.expiresAt > new Date(payment.payment_date)
          ? new Date(existing.expiresAt)
          : new Date(payment.payment_date);
      const nextExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await Subscription.findOneAndUpdate(
        { businessId },
        {
          plan: resolvedPlan?.id || "trial",
          status: "active",
          active: true,
          startsAt: new Date(payment.payment_date),
          expiresAt: nextExpiry,
          canceledAt: null,
        },
        { upsert: true, new: true }
      );
    }

    return res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("createSubscriptionPayment:", err);
    return res.status(500).json({ message: "Failed to create subscription payment" });
  }
};

export const updateSubscriptionPayment = async (req, res) => {
  try {
    const payment = await SubscriptionPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Subscription payment not found" });

    const {
      plan,
      payment_date,
      month,
      amount,
      method,
      status,
      reference_no,
      remarks,
    } = req.body;

    if (plan !== undefined) payment.plan = plan;
    if (payment_date !== undefined) payment.payment_date = new Date(payment_date);
    if (month !== undefined && MONTH_REGEX.test(month)) payment.month = month;
    if (amount !== undefined) payment.amount = Number(amount);
    if (method !== undefined) payment.method = method;
    if (status !== undefined) payment.status = status;
    if (reference_no !== undefined) payment.reference_no = reference_no;
    if (remarks !== undefined) payment.remarks = remarks;

    await payment.save();

    if (payment.status === "received") {
      const resolvedPlan = await getPlanById(payment.plan);
      const durationDays = Number(resolvedPlan?.durationDays || 30);
      const existing = await Subscription.findOne({ businessId: payment.businessId });
      const baseDate =
        existing?.expiresAt && existing.expiresAt > new Date(payment.payment_date)
          ? new Date(existing.expiresAt)
          : new Date(payment.payment_date);
      const nextExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await Subscription.findOneAndUpdate(
        { businessId: payment.businessId },
        {
          plan: resolvedPlan?.id || "trial",
          status: "active",
          active: true,
          startsAt: new Date(payment.payment_date),
          expiresAt: nextExpiry,
          canceledAt: null,
        },
        { upsert: true, new: true }
      );
    }

    return res.json({ success: true, data: payment });
  } catch (err) {
    console.error("updateSubscriptionPayment:", err);
    return res.status(500).json({ message: "Failed to update subscription payment" });
  }
};
