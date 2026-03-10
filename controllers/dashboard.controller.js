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
const DEFAULT_ALLOWANCE = 1500;

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

const getMonthKeyFromDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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

const isAllowanceEligible = ({ recordCount, absentCount, halfCount }) =>
  recordCount >= 26 && absentCount === 0 && halfCount <= 1;

const calculateCustomerMonthlySummary = async ({ businessMatch, selectedMonth, selectedRange }) => {
  const customers = await Customer.find(businessMatch)
    .select("_id name opening_balance isActive")
    .lean();

  if (!customers.length) {
    return {
      customer_count: 0,
      active_customer_count: 0,
      customer_with_activity: 0,
      billed_amount: 0,
      received_amount: 0,
      arrears_amount: 0,
      balance_amount: 0,
      by_customer: [],
    };
  }

  const customerIds = customers.map((row) => row._id);

  const [invoices, payments] = await Promise.all([
    Invoice.find({
      ...businessMatch,
      customer_id: { $in: customerIds },
      invoice_date: { $lte: selectedRange.to },
    })
      .select("customer_id total_amount invoice_date")
      .lean(),
    CustomerPayment.find({
      ...businessMatch,
      customer_id: { $in: customerIds },
      date: { $lte: selectedRange.to },
    })
      .select("customer_id amount date")
      .lean(),
  ]);

  const byCustomer = new Map(
    customers.map((row) => [
      String(row?._id || ""),
      {
        customer_id: String(row?._id || ""),
        customer_name: row?.name || "",
        is_active: Boolean(row?.isActive),
        opening_amount: Number(row?.opening_balance || 0),
        arrears_amount: Number(row?.opening_balance || 0),
        billed_amount: 0,
        received_amount: 0,
      },
    ])
  );

  invoices.forEach((row) => {
    const id = String(row?.customer_id || "");
    const current = byCustomer.get(id);
    if (!current) return;
    const monthKey = getMonthKeyFromDate(row?.invoice_date);
    if (!monthKey) return;
    if (monthKey < selectedMonth) {
      current.arrears_amount += Number(row?.total_amount || 0);
      return;
    }
    if (monthKey !== selectedMonth) return;
    current.billed_amount += Number(row?.total_amount || 0);
  });

  payments.forEach((row) => {
    const id = String(row?.customer_id || "");
    const current = byCustomer.get(id);
    if (!current) return;
    const monthKey = getMonthKeyFromDate(row?.date);
    if (!monthKey) return;
    if (monthKey < selectedMonth) {
      current.arrears_amount -= Number(row?.amount || 0);
      return;
    }
    if (monthKey !== selectedMonth) return;
    current.received_amount += Number(row?.amount || 0);
  });

  const total = {
    customer_count: customers.length,
    active_customer_count: customers.filter((row) => Boolean(row?.isActive)).length,
    customer_with_activity: 0,
    billed_amount: 0,
    received_amount: 0,
    arrears_amount: 0,
    balance_amount: 0,
    by_customer: [],
  };

  byCustomer.forEach((row) => {
    const historyBalance = row.arrears_amount;
    const effectiveArrears = historyBalance === 0 ? row.opening_amount : historyBalance;
    const balanceAmount = effectiveArrears + row.billed_amount - row.received_amount;
    if (row.billed_amount > 0 || row.received_amount > 0) {
      total.customer_with_activity += 1;
    }

    total.billed_amount += row.billed_amount;
    total.received_amount += row.received_amount;
    total.arrears_amount += effectiveArrears;
    total.balance_amount += balanceAmount;
    total.by_customer.push({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      is_active: row.is_active,
      arrears_amount: effectiveArrears,
      billed_amount: row.billed_amount,
      received_amount: row.received_amount,
      balance_amount: balanceAmount,
    });
  });

  total.by_customer.sort((a, b) => a.customer_name.localeCompare(b.customer_name));
  return total;
};

const calculateSupplierMonthlySummary = async ({ businessMatch, selectedMonth, selectedRange }) => {
  const suppliers = await Supplier.find(businessMatch)
    .select("_id name opening_balance isActive")
    .lean();

  if (!suppliers.length) {
    return {
      supplier_count: 0,
      active_supplier_count: 0,
      supplier_with_activity: 0,
      expense_amount: 0,
      paid_amount: 0,
      arrears_amount: 0,
      balance_amount: 0,
      by_supplier: [],
    };
  }

  const supplierIds = suppliers.map((row) => row._id);
  const [expenses, payments] = await Promise.all([
    Expense.find({
      ...businessMatch,
      supplier_id: { $in: supplierIds },
      date: { $lte: selectedRange.to },
    })
      .select("supplier_id amount date")
      .lean(),
    SupplierPayment.find({
      ...businessMatch,
      supplier_id: { $in: supplierIds },
      date: { $lte: selectedRange.to },
    })
      .select("supplier_id amount date")
      .lean(),
  ]);

  const bySupplier = new Map(
    suppliers.map((row) => [
      String(row?._id || ""),
      {
        supplier_id: String(row?._id || ""),
        supplier_name: row?.name || "",
        is_active: Boolean(row?.isActive),
        opening_amount: Number(row?.opening_balance || 0),
        arrears_amount: Number(row?.opening_balance || 0),
        expense_amount: 0,
        paid_amount: 0,
      },
    ])
  );

  expenses.forEach((row) => {
    const id = String(row?.supplier_id || "");
    const current = bySupplier.get(id);
    if (!current) return;
    const monthKey = getMonthKeyFromDate(row?.date);
    if (!monthKey) return;
    if (monthKey < selectedMonth) {
      current.arrears_amount += Number(row?.amount || 0);
      return;
    }
    if (monthKey !== selectedMonth) return;
    current.expense_amount += Number(row?.amount || 0);
  });

  payments.forEach((row) => {
    const id = String(row?.supplier_id || "");
    const current = bySupplier.get(id);
    if (!current) return;
    const monthKey = getMonthKeyFromDate(row?.date);
    if (!monthKey) return;
    if (monthKey < selectedMonth) {
      current.arrears_amount -= Number(row?.amount || 0);
      return;
    }
    if (monthKey !== selectedMonth) return;
    current.paid_amount += Number(row?.amount || 0);
  });

  const total = {
    supplier_count: suppliers.length,
    active_supplier_count: suppliers.filter((row) => Boolean(row?.isActive)).length,
    supplier_with_activity: 0,
    expense_amount: 0,
    paid_amount: 0,
    arrears_amount: 0,
    balance_amount: 0,
    by_supplier: [],
  };

  bySupplier.forEach((row) => {
    const historyBalance = row.arrears_amount;
    const effectiveArrears = historyBalance === 0 ? row.opening_amount : historyBalance;
    const balanceAmount = effectiveArrears + row.expense_amount - row.paid_amount;
    if (row.expense_amount > 0 || row.paid_amount > 0) {
      total.supplier_with_activity += 1;
    }

    total.expense_amount += row.expense_amount;
    total.paid_amount += row.paid_amount;
    total.arrears_amount += effectiveArrears;
    total.balance_amount += balanceAmount;
    total.by_supplier.push({
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      is_active: row.is_active,
      arrears_amount: effectiveArrears,
      expense_amount: row.expense_amount,
      paid_amount: row.paid_amount,
      balance_amount: balanceAmount,
    });
  });

  total.by_supplier.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
  return total;
};

const calculateCrpStaffMonthlySummary = async ({ businessMatch, selectedRange }) => {
  const crpStaff = await Staff.find({
    ...businessMatch,
    category: "Cropping",
  })
    .select("_id name opening_balance isActive")
    .lean();

  if (!crpStaff.length) {
    return {
      staff_count: 0,
      active_staff_count: 0,
      staff_with_activity: 0,
      record_count: 0,
      work_amount: 0,
      arrears_amount: 0,
      deduction_amount: 0,
      balance_amount: 0,
      by_staff: [],
    };
  }

  const staffIds = crpStaff.map((row) => row._id);
  const [records, payments] = await Promise.all([
    CrpStaffRecord.find({
      ...businessMatch,
      staff_id: { $in: staffIds },
      order_date: { $gte: selectedRange.from, $lte: selectedRange.to },
    })
      .select("staff_id total_amount")
      .lean(),
    StaffPayment.find({
      ...businessMatch,
      staff_id: { $in: staffIds },
      date: { $gte: selectedRange.from, $lte: selectedRange.to },
    })
      .select("staff_id amount")
      .lean(),
  ]);

  const byStaff = new Map(
    crpStaff.map((row) => [
      String(row?._id || ""),
      {
        staff_id: String(row?._id || ""),
        staff_name: row?.name || "",
        is_active: Boolean(row?.isActive),
        arrears_amount: Number(row?.opening_balance || 0),
        record_count: 0,
        work_amount: 0,
        deduction_amount: 0,
      },
    ])
  );

  records.forEach((row) => {
    const id = String(row?.staff_id || "");
    const current = byStaff.get(id);
    if (!current) return;
    current.record_count += 1;
    current.work_amount += Number(row?.total_amount || 0);
  });

  payments.forEach((row) => {
    const id = String(row?.staff_id || "");
    const current = byStaff.get(id);
    if (!current) return;
    current.deduction_amount += Number(row?.amount || 0);
  });

  const total = {
    staff_count: crpStaff.length,
    active_staff_count: crpStaff.filter((row) => Boolean(row?.isActive)).length,
    staff_with_activity: 0,
    record_count: 0,
    work_amount: 0,
    arrears_amount: 0,
    deduction_amount: 0,
    balance_amount: 0,
    by_staff: [],
  };

  byStaff.forEach((row) => {
    if (row.record_count > 0 || row.deduction_amount > 0) {
      total.staff_with_activity += 1;
    }
    const balanceAmount = row.arrears_amount + row.work_amount - row.deduction_amount;
    total.record_count += row.record_count;
    total.work_amount += row.work_amount;
    total.arrears_amount += row.arrears_amount;
    total.deduction_amount += row.deduction_amount;
    total.balance_amount += balanceAmount;
    total.by_staff.push({
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      is_active: row.is_active,
      records: row.record_count,
      arrears_amount: row.arrears_amount,
      work_amount: row.work_amount,
      deduction_amount: row.deduction_amount,
      balance_amount: balanceAmount,
    });
  });

  total.by_staff.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  return total;
};

const calculateStaffMonthlySummary = async ({ businessMatch, selectedMonth, selectedRange }) => {
  const prevMonthKey = previousMonth(selectedMonth);
  const prevMonthEnd = monthRange(prevMonthKey).to;

  const staffs = await Staff.find({
    ...businessMatch,
    category: "Embroidery",
  })
    .select("_id name opening_balance isActive")
    .lean();

  if (!staffs.length) {
    return {
      staff_count: 0,
      active_staff_count: 0,
      staff_with_records: 0,
      record_count: 0,
      work_amount: 0,
      arrears_amount: 0,
      allowance_amount: 0,
      bonus_qty: 0,
      bonus_amount: 0,
      deduction_amount: 0,
      deduction_advance_amount: 0,
      deduction_payment_amount: 0,
      deduction_adjustment_amount: 0,
      balance_amount: 0,
      by_staff: [],
    };
  }

  const staffIds = staffs.map((staff) => staff._id);

  const [records, payments] = await Promise.all([
    StaffRecord.find({
      ...businessMatch,
      staff_id: { $in: staffIds },
      date: { $lte: selectedRange.to },
    })
      .select("staff_id date attendance final_amount bonus_qty bonus_amount config_snapshot.allowance")
      .lean(),
    StaffPayment.find({
      ...businessMatch,
      staff_id: { $in: staffIds },
      date: { $lte: selectedRange.to },
    })
      .select("staff_id date month type amount")
      .lean(),
  ]);

  const summaryByStaff = new Map(
    staffs.map((staff) => [
      String(staff._id),
      {
        staff_id: String(staff?._id || ""),
        staff_name: staff?.name || "",
        is_active: Boolean(staff?.isActive),
        arrears: Number(staff?.opening_balance || 0),
        currentRecordCount: 0,
        currentFinal: 0,
        currentBonusQty: 0,
        currentBonusAmt: 0,
        currentAbsent: 0,
        currentHalf: 0,
        currentAllowanceCandidate: null,
        currentAllowance: 0,
        currentDeduction: 0,
        currentAdvance: 0,
        currentPayment: 0,
        currentAdjustment: 0,
      },
    ])
  );

  const historyMonthStats = new Map();

  records.forEach((rec) => {
    const staffId = String(rec?.staff_id || "");
    if (!summaryByStaff.has(staffId)) return;

    const monthKey = getMonthKeyFromDate(rec?.date);
    if (!monthKey) return;

    if (monthKey < selectedMonth) {
      const historyKey = `${staffId}::${monthKey}`;
      const prev = historyMonthStats.get(historyKey) || {
        staffId,
        monthKey,
        recordCount: 0,
        absentCount: 0,
        halfCount: 0,
        finalAmount: 0,
        allowanceCandidate: null,
      };
      prev.recordCount += 1;
      if (rec?.attendance === "Absent") prev.absentCount += 1;
      if (rec?.attendance === "Half") prev.halfCount += 1;
      prev.finalAmount += Number(rec?.final_amount || 0);
      const allowance = Number(rec?.config_snapshot?.allowance);
      if (Number.isFinite(allowance) && allowance >= 0) {
        prev.allowanceCandidate = allowance;
      }
      historyMonthStats.set(historyKey, prev);
      return;
    }

    if (monthKey !== selectedMonth) return;

    const current = summaryByStaff.get(staffId);
    current.currentRecordCount += 1;
    current.currentFinal += Number(rec?.final_amount || 0);
    current.currentBonusQty += Number(rec?.bonus_qty || 0);
    current.currentBonusAmt += Number(rec?.bonus_amount || 0);
    if (rec?.attendance === "Absent") current.currentAbsent += 1;
    if (rec?.attendance === "Half") current.currentHalf += 1;
    const allowance = Number(rec?.config_snapshot?.allowance);
    if (Number.isFinite(allowance) && allowance >= 0) {
      current.currentAllowanceCandidate = allowance;
    }
  });

  const sortedHistory = [...historyMonthStats.values()].sort((a, b) =>
    a.monthKey === b.monthKey ? a.staffId.localeCompare(b.staffId) : a.monthKey.localeCompare(b.monthKey)
  );

  sortedHistory.forEach((row) => {
    const current = summaryByStaff.get(row.staffId);
    if (!current) return;
    current.arrears += Number(row.finalAmount || 0);
    if (isAllowanceEligible(row)) {
      current.arrears += Number(row.allowanceCandidate ?? DEFAULT_ALLOWANCE);
    }
  });

  payments.forEach((payment) => {
    const staffId = String(payment?.staff_id || "");
    const current = summaryByStaff.get(staffId);
    if (!current) return;

    const amount = Number(payment?.amount || 0);
    const paymentMonth = typeof payment?.month === "string" && payment.month
      ? payment.month
      : getMonthKeyFromDate(payment?.date);
    const paymentDate = payment?.date ? new Date(payment.date) : null;

    const isHistoryPayment = paymentMonth
      ? paymentMonth <= prevMonthKey
      : Boolean(paymentDate && paymentDate <= prevMonthEnd);

    if (isHistoryPayment) {
      current.arrears -= amount;
      return;
    }

    if (paymentMonth !== selectedMonth) return;

    current.currentDeduction += amount;
    if (payment?.type === "advance") current.currentAdvance += amount;
    if (payment?.type === "payment") current.currentPayment += amount;
    if (payment?.type === "adjustment") current.currentAdjustment += amount;
  });

  let staffWithRecords = 0;
  const total = {
    staff_count: staffs.length,
    active_staff_count: staffs.filter((s) => Boolean(s?.isActive)).length,
    staff_with_records: 0,
    record_count: 0,
    work_amount: 0,
    arrears_amount: 0,
    allowance_amount: 0,
    bonus_qty: 0,
    bonus_amount: 0,
    deduction_amount: 0,
    deduction_advance_amount: 0,
    deduction_payment_amount: 0,
    deduction_adjustment_amount: 0,
    balance_amount: 0,
    by_staff: [],
  };

  summaryByStaff.forEach((row) => {
    if (row.currentRecordCount > 0) {
      staffWithRecords += 1;
    }
    row.currentAllowance = isAllowanceEligible({
      recordCount: row.currentRecordCount,
      absentCount: row.currentAbsent,
      halfCount: row.currentHalf,
    })
      ? Number(row.currentAllowanceCandidate ?? DEFAULT_ALLOWANCE)
      : 0;

    const workAmount = row.currentFinal - row.currentBonusAmt;

    total.record_count += row.currentRecordCount;
    total.work_amount += workAmount;
    total.arrears_amount += row.arrears;
    total.allowance_amount += row.currentAllowance;
    total.bonus_qty += row.currentBonusQty;
    total.bonus_amount += row.currentBonusAmt;
    total.deduction_amount += row.currentDeduction;
    total.deduction_advance_amount += row.currentAdvance;
    total.deduction_payment_amount += row.currentPayment;
    total.deduction_adjustment_amount += row.currentAdjustment;
    const balance = row.arrears + row.currentFinal + row.currentAllowance - row.currentDeduction;
    total.balance_amount += balance;
    total.by_staff.push({
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      is_active: row.is_active,
      records: row.currentRecordCount,
      work_amount: workAmount,
      arrears_amount: row.arrears,
      allowance_amount: row.currentAllowance,
      bonus_qty: row.currentBonusQty,
      bonus_amount: row.currentBonusAmt,
      deduction_amount: row.currentDeduction,
      deduction_advance_amount: row.currentAdvance,
      deduction_payment_amount: row.currentPayment,
      deduction_adjustment_amount: row.currentAdjustment,
      balance_amount: balance,
    });
  });

  total.staff_with_records = staffWithRecords;
  total.by_staff.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  return total;
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
      staffMonthlySummary,
      customerMonthlySummary,
      supplierMonthlySummary,
      crpStaffMonthlySummary,
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
      calculateStaffMonthlySummary({
        businessMatch,
        selectedMonth,
        selectedRange,
      }),
      calculateCustomerMonthlySummary({
        businessMatch,
        selectedMonth,
        selectedRange,
      }),
      calculateSupplierMonthlySummary({
        businessMatch,
        selectedMonth,
        selectedRange,
      }),
      calculateCrpStaffMonthlySummary({
        businessMatch,
        selectedRange,
      }),
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
          staff_summary: staffMonthlySummary,
          customer_summary: customerMonthlySummary,
          supplier_summary: supplierMonthlySummary,
          crp_staff_summary: crpStaffMonthlySummary,
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
