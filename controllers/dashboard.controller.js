import mongoose from "mongoose";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Expense from "../models/Expense.js";
import CustomerPayment from "../models/CustomerPayment.js";
import SupplierPayment from "../models/SupplierPayment.js";
import StaffPayment from "../models/StaffPayment.js";
import StaffRecord from "../models/StaffRecord.js";
import CrpStaffRecord from "../models/CrpStaffRecord.js";
import Customer from "../models/Customer.js";
import Supplier from "../models/Supplier.js";
import Staff from "../models/Staff.js";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const toYmd = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const monthRange = (monthStr) => {
  const [year, month] = monthStr.split("-").map(Number);
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
};

const previousMonth = (monthStr) => {
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const sanitizeMonth = (raw) => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (MONTH_REGEX.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
};

const buildBusinessFilter = (req) => {
  if (req.user?.role !== "developer" && req.user?.businessId) {
    return { businessId: new mongoose.Types.ObjectId(req.user.businessId) };
  }

  const businessId = req.query?.businessId;
  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    return { businessId: new mongoose.Types.ObjectId(businessId) };
  }

  return {};
};

const aggregateCountAndAmount = async (Model, dateField, amountField, baseMatch, from, to) => {
  const [res] = await Model.aggregate([
    {
      $match: {
        ...baseMatch,
        [dateField]: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amount: { $sum: `$${amountField}` },
      },
    },
  ]);

  return {
    count: Number(res?.count || 0),
    amount: Number(res?.amount || 0),
  };
};

const aggregateTrendByDay = async (Model, dateField, amountField, baseMatch, from, to, asCount = false) => {
  const [rows] = await Promise.all([
    Model.aggregate([
      {
        $match: {
          ...baseMatch,
          [dateField]: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` },
          },
          value: asCount ? { $sum: 1 } : { $sum: `$${amountField}` },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return new Map((rows || []).map((row) => [row._id, Number(row.value || 0)]));
};

const buildTrendBuckets = (from, to) => {
  const buckets = [];
  const current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    buckets.push({
      key: toYmd(current),
      day: current.toLocaleDateString("en-US", { weekday: "short" }),
      orders: 0,
      invoices: 0,
      expenses: 0,
      paymentsIn: 0,
      paymentsOut: 0,
    });

    current.setDate(current.getDate() + 1);
  }

  return buckets;
};

const parseDateInput = (value) => {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const getTrendRange = ({ range, dateFrom, dateTo }) => {
  const now = new Date();
  const end = endOfDay(now);
  const start = startOfDay(now);

  if (range === "1m") {
    start.setDate(start.getDate() - 29);
    return { from: start, to: end };
  }

  if (range === "3m") {
    start.setDate(start.getDate() - 89);
    return { from: start, to: end };
  }

  if (range === "6m") {
    start.setDate(start.getDate() - 179);
    return { from: start, to: end };
  }

  if (range === "custom") {
    const fromParsed = parseDateInput(dateFrom);
    const toParsed = parseDateInput(dateTo);
    if (!fromParsed || !toParsed) return null;
    const from = startOfDay(fromParsed);
    const to = endOfDay(toParsed);
    if (from > to) return null;
    return { from, to };
  }

  start.setDate(start.getDate() - 6);
  return { from: start, to: end };
};

export const getDashboardSummary = async (req, res) => {
  try {
    const businessMatch = buildBusinessFilter(req);
    const selectedMonth = sanitizeMonth(req.query?.month);
    const trendMode = req.query?.trend_mode === "last" ? "last" : "current";

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const selectedRange = monthRange(selectedMonth);

    const trendMonth = trendMode === "last" ? previousMonth(selectedMonth) : selectedMonth;
    const trendMonthRange = monthRange(trendMonth);

    const trendEnd = trendMode === "current"
      ? new Date(Math.min(endOfDay(now).getTime(), trendMonthRange.to.getTime()))
      : trendMonthRange.to;

    const trendStart = startOfDay(new Date(trendEnd.getTime() - 6 * 24 * 60 * 60 * 1000));

    const [
      todayOrders,
      todayInvoices,
      todayExpenses,
      todayPaymentIn,
      todaySupplierOut,
      todayStaffOut,

      monthOrders,
      monthInvoices,
      monthExpenses,
      monthPaymentIn,
      monthSupplierOut,
      monthStaffOut,
      monthStaffRecords,
      monthCrpRecords,

      activeCustomers,
      activeSuppliers,
      activeStaff,

      recentOrders,
      recentInvoices,
      recentExpenses,

      ordersTrend,
      invoicesTrend,
      expensesTrend,
      paymentInTrend,
      supplierOutTrend,
      staffOutTrend,
    ] = await Promise.all([
      aggregateCountAndAmount(Order, "date", "total_amount", businessMatch, todayStart, todayEnd),
      aggregateCountAndAmount(Invoice, "invoice_date", "total_amount", businessMatch, todayStart, todayEnd),
      aggregateCountAndAmount(Expense, "date", "amount", businessMatch, todayStart, todayEnd),
      aggregateCountAndAmount(CustomerPayment, "date", "amount", businessMatch, todayStart, todayEnd),
      aggregateCountAndAmount(SupplierPayment, "date", "amount", businessMatch, todayStart, todayEnd),
      aggregateCountAndAmount(StaffPayment, "date", "amount", businessMatch, todayStart, todayEnd),

      aggregateCountAndAmount(Order, "date", "total_amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(Invoice, "invoice_date", "total_amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(Expense, "date", "amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(CustomerPayment, "date", "amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(SupplierPayment, "date", "amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(StaffPayment, "date", "amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(StaffRecord, "date", "final_amount", businessMatch, selectedRange.from, selectedRange.to),
      aggregateCountAndAmount(CrpStaffRecord, "order_date", "total_amount", businessMatch, selectedRange.from, selectedRange.to),

      Customer.countDocuments({ ...businessMatch, isActive: true }),
      Supplier.countDocuments({ ...businessMatch, isActive: true }),
      Staff.countDocuments({ ...businessMatch, isActive: true }),

      Order.find(businessMatch).sort({ date: -1, createdAt: -1 }).limit(5).lean(),
      Invoice.find(businessMatch).sort({ invoice_date: -1, createdAt: -1 }).limit(5).lean(),
      Expense.find(businessMatch).sort({ date: -1, createdAt: -1 }).limit(5).lean(),

      aggregateTrendByDay(Order, "date", "total_amount", businessMatch, trendStart, trendEnd, true),
      aggregateTrendByDay(Invoice, "invoice_date", "total_amount", businessMatch, trendStart, trendEnd, true),
      aggregateTrendByDay(Expense, "date", "amount", businessMatch, trendStart, trendEnd),
      aggregateTrendByDay(CustomerPayment, "date", "amount", businessMatch, trendStart, trendEnd),
      aggregateTrendByDay(SupplierPayment, "date", "amount", businessMatch, trendStart, trendEnd),
      aggregateTrendByDay(StaffPayment, "date", "amount", businessMatch, trendStart, trendEnd),
    ]);

    const trendBuckets = buildTrendBuckets(trendStart, trendEnd).map((row) => ({
      ...row,
      orders: Number(ordersTrend.get(row.key) || 0),
      invoices: Number(invoicesTrend.get(row.key) || 0),
      expenses: Number(expensesTrend.get(row.key) || 0),
      paymentsIn: Number(paymentInTrend.get(row.key) || 0),
      paymentsOut: Number(supplierOutTrend.get(row.key) || 0) + Number(staffOutTrend.get(row.key) || 0),
    }));

    return res.json({
      success: true,
      data: {
        selected_month: selectedMonth,
        trend_mode: trendMode,
        trend_month: trendMonth,
        trend_from: toYmd(trendStart),
        trend_to: toYmd(trendEnd),

        today: {
          orders: todayOrders,
          invoices: todayInvoices,
          expenses: todayExpenses,
          payment_in: todayPaymentIn,
          payment_out: {
            count: todaySupplierOut.count + todayStaffOut.count,
            amount: todaySupplierOut.amount + todayStaffOut.amount,
          },
        },

        month: {
          orders: monthOrders,
          invoices: monthInvoices,
          expenses: monthExpenses,
          staff_records: monthStaffRecords,
          crp_records: monthCrpRecords,
          payment_in: monthPaymentIn,
          payment_out: {
            count: monthSupplierOut.count + monthStaffOut.count,
            amount: monthSupplierOut.amount + monthStaffOut.amount,
            supplier: monthSupplierOut,
            staff: monthStaffOut,
          },
        },

        active: {
          customers: Number(activeCustomers || 0),
          suppliers: Number(activeSuppliers || 0),
          staff: Number(activeStaff || 0),
        },

        recent: {
          orders: recentOrders || [],
          invoices: recentInvoices || [],
          expenses: recentExpenses || [],
        },

        trend_7_day: trendBuckets,
      },
    });
  } catch (err) {
    console.error("getDashboardSummary:", err);
    return res.status(500).json({ message: "Failed to fetch dashboard summary" });
  }
};

export const getDashboardTrend = async (req, res) => {
  try {
    const businessMatch = buildBusinessFilter(req);
    const range = typeof req.query?.range === "string" ? req.query.range.trim().toLowerCase() : "7d";
    const resolvedRange = getTrendRange({
      range,
      dateFrom: req.query?.date_from,
      dateTo: req.query?.date_to,
    });

    if (!resolvedRange) {
      return res.status(400).json({ message: "Invalid trend date range" });
    }

    const { from, to } = resolvedRange;

    const [ordersTrend, expensesTrend, paymentInTrend, supplierOutTrend, staffOutTrend] = await Promise.all([
      aggregateTrendByDay(Order, "date", "total_amount", businessMatch, from, to, true),
      aggregateTrendByDay(Expense, "date", "amount", businessMatch, from, to),
      aggregateTrendByDay(CustomerPayment, "date", "amount", businessMatch, from, to),
      aggregateTrendByDay(SupplierPayment, "date", "amount", businessMatch, from, to),
      aggregateTrendByDay(StaffPayment, "date", "amount", businessMatch, from, to),
    ]);

    const trend = buildTrendBuckets(from, to).map((row) => ({
      ...row,
      day: row.key,
      orders: Number(ordersTrend.get(row.key) || 0),
      expenses: Number(expensesTrend.get(row.key) || 0),
      paymentsIn: Number(paymentInTrend.get(row.key) || 0),
      paymentsOut: Number(supplierOutTrend.get(row.key) || 0) + Number(staffOutTrend.get(row.key) || 0),
    }));

    return res.json({
      success: true,
      data: {
        range,
        from: toYmd(from),
        to: toYmd(to),
        trend,
      },
    });
  } catch (err) {
    console.error("getDashboardTrend:", err);
    return res.status(500).json({ message: "Failed to fetch dashboard trend" });
  }
};
