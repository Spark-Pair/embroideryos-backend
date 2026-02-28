import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";
import SupplierPayment from "../models/SupplierPayment.js";
import Expense from "../models/Expense.js";

const PAYMENT_METHODS = new Set(["cash", "cheque", "online"]);

const normalizeMonth = (month) => (typeof month === "string" ? month.trim() : "");
const normalizeText = (val) => (typeof val === "string" ? val.trim() : "");

const buildBusinessFilter = (req) => {
  if (req.user?.role !== "developer" && req.user?.businessId) {
    return { businessId: new mongoose.Types.ObjectId(req.user.businessId) };
  }

  const businessId = req.query?.businessId || req.body?.businessId;
  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    return { businessId: new mongoose.Types.ObjectId(businessId) };
  }

  return {};
};

export const createSupplierPayment = async (req, res) => {
  try {
    const { supplier_id, date, method, reference_no, remarks } = req.body;

    const amount = Number(req.body.amount);

    if (!mongoose.Types.ObjectId.isValid(supplier_id)) {
      return res.status(400).json({ message: "Invalid supplier_id" });
    }

    const normalizedMonth = normalizeMonth(String(date).slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
      return res.status(400).json({ message: "Month must be in YYYY-MM format" });
    }

    if (!PAYMENT_METHODS.has(method)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    if (!date || Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const businessFilter = buildBusinessFilter(req);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    const supplier = await Supplier.findOne({ _id: supplier_id, ...businessFilter }).select("_id name").lean();
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const payment = await SupplierPayment.create({
      supplier_id,
      supplier_name: supplier.name,
      date: new Date(date),
      month: normalizedMonth,
      method,
      amount,
      reference_no: normalizeText(reference_no),
      remarks: normalizeText(remarks),
      businessId,
    });

    const populated = await SupplierPayment.findById(payment._id).populate("supplier_id", "name opening_balance");

    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("createSupplierPayment:", err);
    return res.status(500).json({ message: "Failed to create supplier payment" });
  }
};

export const getSupplierPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      supplier_id,
      method,
      month,
      date_from,
      date_to,
      name,
    } = req.query;

    const filter = buildBusinessFilter(req);

    if (supplier_id && mongoose.Types.ObjectId.isValid(supplier_id)) {
      filter.supplier_id = new mongoose.Types.ObjectId(supplier_id);
    }

    if (method && PAYMENT_METHODS.has(method)) {
      filter.method = method;
    }

    const normalizedMonth = normalizeMonth(month);
    if (normalizedMonth) filter.month = normalizedMonth;

    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to) filter.date.$lte = new Date(date_to);
    }

    if (name?.trim()) {
      const supplierFilter = { name: { $regex: name.trim(), $options: "i" } };
      if (filter.businessId) supplierFilter.businessId = filter.businessId;

      const supplierIds = await Supplier.find(supplierFilter).distinct("_id");
      if (filter.supplier_id instanceof mongoose.Types.ObjectId) {
        filter.supplier_id = supplierIds.some((id) => id.equals(filter.supplier_id)) ? filter.supplier_id : { $in: [] };
      } else {
        filter.supplier_id = { $in: supplierIds };
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 30, 1);
    const skip = (pageNum - 1) * limitNum;

    const [total, payments] = await Promise.all([
      SupplierPayment.countDocuments(filter),
      SupplierPayment.find(filter)
        .populate("supplier_id", "name opening_balance")
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
    console.error("getSupplierPayments:", err);
    return res.status(500).json({ message: "Failed to fetch supplier payments" });
  }
};

export const getSupplierPaymentStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);

    const [stats] = await SupplierPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ["$method", "cash"] }, 1, 0] } },
          cheque: { $sum: { $cond: [{ $eq: ["$method", "cheque"] }, 1, 0] } },
          online: { $sum: { $cond: [{ $eq: ["$method", "online"] }, 1, 0] } },
          total_amount: { $sum: "$amount" },
        },
      },
    ]);

    return res.json({
      success: true,
      data:
        stats || {
          total: 0,
          cash: 0,
          cheque: 0,
          online: 0,
          total_amount: 0,
        },
    });
  } catch (err) {
    console.error("getSupplierPaymentStats:", err);
    return res.status(500).json({ message: "Failed to fetch supplier payment stats" });
  }
};

export const getSupplierPaymentMonths = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);
    const months = await SupplierPayment.distinct("month", filter);
    months.sort((a, b) => (a < b ? 1 : -1));
    return res.json({ success: true, data: months });
  } catch (err) {
    console.error("getSupplierPaymentMonths:", err);
    return res.status(500).json({ message: "Failed to fetch supplier payment months" });
  }
};

export const getSupplierStatement = async (req, res) => {
  try {
    const { supplier_id, date_from, date_to } = req.query;

    if (!supplier_id || !mongoose.Types.ObjectId.isValid(supplier_id)) {
      return res.status(400).json({ message: "Valid supplier_id is required" });
    }
    if (!date_from || Number.isNaN(new Date(date_from).getTime())) {
      return res.status(400).json({ message: "Valid date_from is required" });
    }
    if (!date_to || Number.isNaN(new Date(date_to).getTime())) {
      return res.status(400).json({ message: "Valid date_to is required" });
    }

    const startDate = new Date(date_from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date_to);
    endDate.setHours(23, 59, 59, 999);
    if (endDate < startDate) {
      return res.status(400).json({ message: "date_to must be greater than or equal to date_from" });
    }

    const businessFilter = buildBusinessFilter(req);
    const supplierObjectId = new mongoose.Types.ObjectId(supplier_id);
    const supplier = await Supplier.findOne({ _id: supplierObjectId, ...businessFilter })
      .select("_id name opening_balance")
      .lean();
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const supplierExpenseFilter = {
      ...businessFilter,
      supplier_id: supplierObjectId,
      $or: [
        { expense_type: "supplier" },
        { expense_type: "fixed", fixed_source: "supplier" },
      ],
    };

    const [priorExpensesAgg, priorPaymentsAgg, expenses, payments] = await Promise.all([
      Expense.aggregate([
        { $match: { ...supplierExpenseFilter, date: { $lt: startDate } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      SupplierPayment.aggregate([
        { $match: { ...businessFilter, supplier_id: supplierObjectId, date: { $lt: startDate } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.find({ ...supplierExpenseFilter, date: { $gte: startDate, $lte: endDate } })
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .select("_id date item_name amount reference_no remarks expense_type fixed_source createdAt")
        .lean(),
      SupplierPayment.find({ ...businessFilter, supplier_id: supplierObjectId, date: { $gte: startDate, $lte: endDate } })
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .select("_id date method amount reference_no remarks createdAt")
        .lean(),
    ]);

    const openingBalance =
      Number(supplier?.opening_balance || 0) +
      Number(priorExpensesAgg?.[0]?.total || 0) -
      Number(priorPaymentsAgg?.[0]?.total || 0);

    const rows = [
      ...expenses.map((row) => ({
        kind: "expense",
        _id: row._id,
        date: row.date,
        details: row.remarks || row.item_name || "",
        reference_no: row.reference_no || "",
        debit: Number(row.amount || 0),
        credit: 0,
        expense_type: row.expense_type || "",
        fixed_source: row.fixed_source || "",
        item_name: row.item_name || "",
        createdAt: row.createdAt,
      })),
      ...payments.map((row) => ({
        kind: "payment",
        _id: row._id,
        date: row.date,
        details: row.remarks || "",
        reference_no: row.reference_no || "",
        method: row.method || "",
        debit: 0,
        credit: Number(row.amount || 0),
        createdAt: row.createdAt,
      })),
    ].sort((a, b) => {
      const ad = new Date(a.date).getTime();
      const bd = new Date(b.date).getTime();
      if (ad !== bd) return ad - bd;
      const ac = new Date(a.createdAt).getTime();
      const bc = new Date(b.createdAt).getTime();
      if (ac !== bc) return ac - bc;
      return String(a._id).localeCompare(String(b._id));
    });

    let running = openingBalance;
    const statementRows = rows.map((row) => {
      running += Number(row.debit || 0);
      running -= Number(row.credit || 0);
      return { ...row, balance: running };
    });

    const totalExpenses = statementRows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalPayments = statementRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const closingBalance = openingBalance + totalExpenses - totalPayments;

    return res.json({
      success: true,
      data: {
        supplier: {
          _id: supplier._id,
          name: supplier.name || "",
        },
        date_from: date_from,
        date_to: date_to,
        opening_balance: openingBalance,
        total_expenses: totalExpenses,
        total_payments: totalPayments,
        net_change: totalExpenses - totalPayments,
        closing_balance: closingBalance,
        rows: statementRows,
      },
    });
  } catch (err) {
    console.error("getSupplierStatement:", err);
    return res.status(500).json({ message: "Failed to generate supplier statement" });
  }
};
