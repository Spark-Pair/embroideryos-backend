import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";
import Expense from "../models/Expense.js";
import SupplierPayment from "../models/SupplierPayment.js";
import ExpenseItem from "../models/ExpenseItem.js";

const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const normalizeAssignedExpenseItems = (value, allowedNames = null) => {
  if (!Array.isArray(value)) return [];

  const allowedMap = allowedNames instanceof Map ? allowedNames : null;
  const seen = new Set();

  return value.reduce((acc, rawValue) => {
    const cleaned = String(rawValue || "").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return acc;
    if (allowedMap && !allowedMap.has(key)) return acc;
    seen.add(key);
    acc.push(allowedMap?.get(key) || cleaned);
    return acc;
  }, []);
};

const buildBusinessFilter = (req, businessId) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId ? { businessId: new mongoose.Types.ObjectId(req.user.businessId) } : {};
  }
  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    return { businessId: new mongoose.Types.ObjectId(businessId) };
  }
  return {};
};

const resolveBusinessId = (req, businessId) => {
  const filter = buildBusinessFilter(req, businessId);
  return filter.businessId || (businessId && mongoose.Types.ObjectId.isValid(businessId) ? new mongoose.Types.ObjectId(businessId) : null);
};

const getAssignableExpenseItemMap = async (businessId) => {
  if (!businessId) return new Map();

  const rows = await ExpenseItem.find({
    businessId,
    $or: [
      { fixed_source: { $exists: false } },
      { fixed_source: "" },
    ],
  })
    .select("name")
    .lean();

  return rows.reduce((acc, row) => {
    const name = String(row?.name || "").trim();
    if (!name) return acc;
    const key = name.toLowerCase();
    if (!acc.has(key)) acc.set(key, name);
    return acc;
  }, new Map());
};

const toId = (value) => String(value);

const attachSupplierCurrentBalance = async (suppliers, businessFilter = {}) => {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return suppliers;

  const supplierIds = suppliers
    .map((s) => s?._id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (supplierIds.length === 0) return suppliers;

  const expenseMatch = { supplier_id: { $in: supplierIds } };
  const paymentMatch = { supplier_id: { $in: supplierIds } };

  if (businessFilter?.businessId) {
    expenseMatch.businessId = businessFilter.businessId;
    paymentMatch.businessId = businessFilter.businessId;
  }

  const [expenseTotals, paymentTotals] = await Promise.all([
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: "$supplier_id", total: { $sum: "$amount" } } },
    ]),
    SupplierPayment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: "$supplier_id", total: { $sum: "$amount" } } },
    ]),
  ]);

  const expenseMap = new Map(expenseTotals.map((row) => [toId(row._id), Number(row.total || 0)]));
  const paymentMap = new Map(paymentTotals.map((row) => [toId(row._id), Number(row.total || 0)]));

  return suppliers.map((supplier) => {
    const id = toId(supplier._id);
    const opening = Number(supplier.opening_balance || 0);
    const expense = expenseMap.get(id) || 0;
    const paid = paymentMap.get(id) || 0;
    return {
      ...(typeof supplier.toObject === "function" ? supplier.toObject() : supplier),
      current_balance: opening + expense - paid,
    };
  });
};

export const createSupplier = async (req, res) => {
  try {
    const { name, opening_balance, assigned_expense_items } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
    const businessId = resolveBusinessId(req, req.body.businessId);
    const allowedExpenseItems = await getAssignableExpenseItemMap(businessId);

    const supplier = await Supplier.create({
      name: name.trim(),
      opening_balance: parseOpeningBalance(opening_balance),
      assigned_expense_items: normalizeAssignedExpenseItems(assigned_expense_items, allowedExpenseItems),
      businessId,
    });

    return res.status(201).json({ success: true, supplier });
  } catch (err) {
    console.error("createSupplier:", err);
    return res.status(500).json({ message: "Failed to create supplier" });
  }
};

export const getSuppliers = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status, businessId } = req.query;

    const filter = {
      ...buildBusinessFilter(req, businessId),
    };

    if (name?.trim()) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }

    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Supplier.countDocuments(filter);
    const data = await Supplier.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const dataWithBalance = await attachSupplierCurrentBalance(data, filter);

    return res.json({
      success: true,
      data: dataWithBalance,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
    });
  } catch (err) {
    console.error("getSuppliers:", err);
    return res.status(500).json({ message: "Failed to fetch suppliers" });
  }
};

export const getSuppliersStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);

    const [total, active, inactive] = await Promise.all([
      Supplier.countDocuments(filter),
      Supplier.countDocuments({ ...filter, isActive: true }),
      Supplier.countDocuments({ ...filter, isActive: false }),
    ]);

    return res.json({ success: true, data: { total, active, inactive } });
  } catch (err) {
    console.error("getSuppliersStats:", err);
    return res.status(500).json({ message: "Failed to fetch suppliers stats" });
  }
};

export const getSupplier = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);
    const supplier = await Supplier.findOne({ _id: req.params.id, ...filter }).lean();
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    const [supplierWithBalance] = await attachSupplierCurrentBalance([supplier], { businessId: supplier.businessId });
    return res.json(supplierWithBalance);
  } catch (err) {
    console.error("getSupplier:", err);
    return res.status(500).json({ message: "Failed to fetch supplier" });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { opening_balance, assigned_expense_items } = req.body;
    const filter = buildBusinessFilter(req, req.body.businessId);

    const supplier = await Supplier.findOne({ _id: req.params.id, ...filter });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    if (opening_balance !== undefined) {
      supplier.opening_balance = parseOpeningBalance(opening_balance);
    }
    if (assigned_expense_items !== undefined) {
      const allowedExpenseItems = await getAssignableExpenseItemMap(supplier.businessId || resolveBusinessId(req, req.body.businessId));
      supplier.assigned_expense_items = normalizeAssignedExpenseItems(assigned_expense_items, allowedExpenseItems);
    }

    await supplier.save();
    return res.json({ success: true, supplier });
  } catch (err) {
    console.error("updateSupplier:", err);
    return res.status(500).json({ message: "Failed to update supplier" });
  }
};

export const toggleSupplierStatus = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.body?.businessId || req.query?.businessId);
    const supplier = await Supplier.findOne({ _id: req.params.id, ...filter });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    supplier.isActive = !supplier.isActive;
    await supplier.save();

    return res.json({ id: supplier._id, isActive: supplier.isActive });
  } catch (err) {
    console.error("toggleSupplierStatus:", err);
    return res.status(500).json({ message: "Failed to toggle supplier status" });
  }
};
