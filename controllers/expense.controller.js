import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import Supplier from "../models/Supplier.js";
import ExpenseItem from "../models/ExpenseItem.js";
import { getBusinessRuleContextByBusinessId, getExpenseTypeRule } from "../utils/businessRuleData.js";

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeText = (val) => (typeof val === "string" ? val.trim() : "");
const normalizeMonth = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeItemKey = (value) => normalizeText(value).toLowerCase();

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

const parseDate = (date, month) => {
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    return new Date(`${month}-01T00:00:00.000Z`);
  }

  if (!date || Number.isNaN(new Date(date).getTime())) return null;
  return new Date(date);
};

const resolveExpenseRule = async (req, businessId, expenseType) => {
  if (normalizeText(expenseType).toLowerCase() === "fixed") {
    return {
      key: "fixed",
      label: "Fixed Expense",
      is_fixed: true,
      requires_supplier: false,
    };
  }
  const context = await getBusinessRuleContextByBusinessId(businessId);
  const rule = getExpenseTypeRule(context, expenseType);
  if (!rule?.key) return null;
  return rule;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveFixedExpenseMeta = async (businessFilter, items = []) => {
  const names = Array.from(new Set(items.map((row) => normalizeItemKey(row?.item_name)).filter(Boolean)));
  if (names.length === 0) {
    return { ok: false, message: "At least one valid fixed expense item is required" };
  }

  const fixedItems = await ExpenseItem.find({
    ...businessFilter,
    expense_type: "fixed",
    $or: names.map((name) => ({ name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } })),
  })
    .select("name fixed_source supplier_id supplier_name")
    .lean();

  const fixedMap = new Map(
    fixedItems.map((item) => [normalizeItemKey(item?.name), item])
  );
  const matched = names.map((name) => fixedMap.get(name)).filter(Boolean);

  if (matched.length !== names.length) {
    return { ok: false, message: "Selected fixed expense item was not found in settings" };
  }

  const sourceSet = new Set(matched.map((item) => normalizeText(item?.fixed_source).toLowerCase()).filter(Boolean));
  if (sourceSet.size !== 1) {
    return { ok: false, message: "Selected fixed expense items must belong to the same fixed source" };
  }

  const fixedSource = Array.from(sourceSet)[0] || "cash";
  if (fixedSource === "supplier") {
    const supplierRows = matched.filter((item) => item?.supplier_id);
    const supplierSet = new Set(supplierRows.map((item) => String(item.supplier_id)));
    if (supplierSet.size !== 1) {
      return { ok: false, message: "Selected supplier fixed expense items must belong to the same supplier" };
    }
    const supplierRow = supplierRows[0];
    return {
      ok: true,
      fixedSource,
      supplierId: String(supplierRow?.supplier_id || ""),
      supplierName: supplierRow?.supplier_name || "",
    };
  }

  return { ok: true, fixedSource, supplierId: "", supplierName: "" };
};

const validateSupplierExpenseItems = (supplier, items = []) => {
  const allowedItems = new Set(
    (Array.isArray(supplier?.assigned_expense_items) ? supplier.assigned_expense_items : [])
      .map((name) => normalizeItemKey(name))
      .filter(Boolean)
  );

  const invalidItems = items
    .map((row) => normalizeText(row?.item_name))
    .filter((name) => name && !allowedItems.has(name.toLowerCase()));

  if (invalidItems.length > 0) {
    return {
      ok: false,
      invalidItems: Array.from(new Set(invalidItems)),
    };
  }

  return { ok: true, invalidItems: [] };
};

export const createExpense = async (req, res) => {
  try {
    const {
      expense_type,
      fixed_source,
      supplier_id,
      date,
      month,
      reference_no,
      remarks,
      items,
      // backward compatibility
      title,
      amount,
      category,
      note,
    } = req.body;

    // Backward compatibility (old single-expense payload)
    if (!Array.isArray(items) && title) {
      const parsedAmount = toNum(amount);
      if (parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }

      const parsedDate = parseDate(date);
      if (!parsedDate) return res.status(400).json({ message: "Valid date is required" });

      const expense = await Expense.create({
        expense_type: "cash",
        item_name: normalizeText(title),
        amount: parsedAmount,
        date: parsedDate,
        month: parsedDate.toISOString().slice(0, 7),
        reference_no: normalizeText(category),
        remarks: normalizeText(note),
        group_key: new mongoose.Types.ObjectId().toString(),
        businessId: req.body.businessId,
      });

      return res.status(201).json({ success: true, data: [expense] });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one expense item is required" });
    }

    const fallbackDate = new Date().toISOString().slice(0, 10);
    const normalizedMonth = normalizeMonth(month || String(date || fallbackDate).slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
      return res.status(400).json({ message: "Month must be in YYYY-MM format" });
    }

    const normalizedItems = items
      .map((row) => ({
        item_name: normalizeText(row?.item_name),
        quantity: toNum(row?.quantity),
        rate: toNum(row?.rate),
        amount: toNum(row?.amount),
      }))
      .filter((row) => row.item_name && ((row.quantity > 0 && row.rate > 0) || row.amount > 0));

    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: "At least one valid expense item is required" });
    }

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    const expenseRule = await resolveExpenseRule(req, businessId, expense_type);
    if (!expenseRule?.key) {
      return res.status(400).json({ message: "Invalid expense type" });
    }

    const parsedDate = parseDate(date || fallbackDate, expenseRule.is_fixed ? normalizedMonth : null);
    if (!parsedDate) return res.status(400).json({ message: "Valid date/month is required" });

    let supplierName = "";
    let supplierObjectId = null;
    let fixedSource = expenseRule.is_fixed ? (expenseRule.requires_supplier ? "supplier" : "cash") : "";

    if (expenseRule.requires_supplier) {
      if (!supplier_id || !mongoose.Types.ObjectId.isValid(supplier_id)) {
        return res.status(400).json({ message: "Valid supplier is required" });
      }

      const supplier = await Supplier.findOne({ _id: supplier_id, ...buildBusinessFilter(req, req.body.businessId) })
        .select("_id name assigned_expense_items")
        .lean();
      if (!supplier) return res.status(404).json({ message: "Supplier not found" });

      const validation = validateSupplierExpenseItems(supplier, normalizedItems);
      if (!validation.ok) {
        return res.status(400).json({
          message: `Selected items are not assigned to this supplier: ${validation.invalidItems.join(", ")}`,
        });
      }

      supplierObjectId = supplier._id;
      supplierName = supplier.name;
    }

    if (expenseRule.is_fixed && expenseRule.key === "fixed") {
      const fixedMeta = await resolveFixedExpenseMeta(buildBusinessFilter(req, req.body.businessId), normalizedItems);
      if (!fixedMeta.ok) {
        return res.status(400).json({ message: fixedMeta.message });
      }
      fixedSource = fixedMeta.fixedSource;
      supplierObjectId = fixedMeta.supplierId && mongoose.Types.ObjectId.isValid(fixedMeta.supplierId)
        ? new mongoose.Types.ObjectId(fixedMeta.supplierId)
        : null;
      supplierName = fixedMeta.supplierName || "";
    }

    const groupKey = new mongoose.Types.ObjectId().toString();
    const docs = normalizedItems.map((row) => {
      const quantity = toNum(row.quantity);
      const rate = toNum(row.rate);
      const rawAmount = toNum(row.amount);
      const derivedAmount = quantity > 0 && rate > 0 ? quantity * rate : rawAmount;

      return {
        expense_type: expenseRule.is_fixed ? "fixed" : expenseRule.key,
        fixed_source: fixedSource,
        item_name: row.item_name,
        quantity,
        rate,
        amount: derivedAmount > 0 ? derivedAmount : rawAmount,
        date: parsedDate,
        month: normalizedMonth,
        reference_no: normalizeText(reference_no),
        remarks: normalizeText(remarks),
        supplier_id: supplierObjectId,
        supplier_name: supplierName,
        group_key: groupKey,
        businessId,
      };
    }).filter((row) => row.amount > 0);

    if (docs.length === 0) {
      return res.status(400).json({ message: "At least one valid expense item is required" });
    }

    const totalQuantity = docs.reduce((sum, row) => sum + toNum(row.quantity), 0);
    const totalAmount = docs.reduce((sum, row) => sum + toNum(row.amount), 0);
    const itemsCount = docs.length;
    const firstItemName = normalizeText(docs[0]?.item_name || "");
    const summaryTitle = itemsCount > 1 ? `${itemsCount} items` : firstItemName;
    const avgRate = totalQuantity > 0 ? totalAmount / totalQuantity : totalAmount;

    const created = await Expense.create({
      expense_type: expenseRule.is_fixed ? "fixed" : expenseRule.key,
      fixed_source: fixedSource,
      item_name: summaryTitle || "Expense",
      quantity: totalQuantity,
      rate: avgRate,
      amount: totalAmount,
      date: parsedDate,
      month: normalizedMonth,
      reference_no: normalizeText(reference_no),
      remarks: normalizeText(remarks),
      supplier_id: supplierObjectId,
      supplier_name: supplierName,
      group_key: groupKey,
      items: docs.map((row) => ({
        item_name: row.item_name,
        quantity: row.quantity,
        rate: row.rate,
        amount: row.amount,
      })),
      items_count: itemsCount,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
      businessId,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("createExpense:", err);
    return res.status(500).json({ message: "Failed to create expense" });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      title,
      item_name,
      expense_type,
      fixed_source,
      date_from,
      date_to,
      month,
      supplier_name,
      reference_no,
      businessId,
    } = req.query;

    const filter = {
      ...buildBusinessFilter(req, businessId),
    };

    const searchableItemName = item_name || title;
    if (searchableItemName?.trim()) {
      const pattern = { $regex: searchableItemName.trim(), $options: "i" };
      filter.$or = [{ item_name: pattern }, { "items.item_name": pattern }];
    }

    if (expense_type?.trim()) {
      filter.expense_type = expense_type.trim();
    }
    if (fixed_source?.trim()) {
      filter.fixed_source = fixed_source.trim();
    }

    if (supplier_name?.trim()) {
      filter.supplier_name = { $regex: supplier_name.trim(), $options: "i" };
    }

    if (reference_no?.trim()) {
      filter.reference_no = { $regex: reference_no.trim(), $options: "i" };
    }

    if (month?.trim()) {
      filter.month = month.trim();
    }

    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to) filter.date.$lte = new Date(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Expense.countDocuments(filter);
    const data = await Expense.find(filter)
      .sort({ createdAt: -1, date: -1 })
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
    console.error("getExpenses:", err);
    return res.status(500).json({ message: "Failed to fetch expenses" });
  }
};

export const getExpenseStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);

    const [summaryRows, breakdownRows] = await Promise.all([
      Expense.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            total_amount: { $sum: "$amount" },
          },
        },
      ]),
      Expense.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$expense_type",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { count: -1, _id: 1 } },
      ]),
    ]);

    const summary = summaryRows?.[0] || {};
    const breakdown = (breakdownRows || [])
      .map((row) => ({
        key: String(row?._id || "").trim(),
        count: Number(row?.count || 0),
        amount: Number(row?.amount || 0),
      }))
      .filter((row) => row.key);

    const counts_by_key = breakdown.reduce((acc, row) => {
      acc[row.key] = row.count;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: {
        total: Number(summary?.total || 0),
        total_amount: Number(summary?.total_amount || 0),
        breakdown,
        counts_by_key,
      },
    });
  } catch (err) {
    console.error("getExpenseStats:", err);
    return res.status(500).json({ message: "Failed to fetch expense stats" });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const {
      expense_type,
      fixed_source,
      supplier_id,
      items,
      item_name,
      quantity,
      rate,
      amount,
      date,
      month,
      reference_no,
      remarks,
    } = req.body;
    const businessFilter = buildBusinessFilter(req, req.body?.businessId || req.query?.businessId);

    const expense = await Expense.findOne({ _id: req.params.id, ...businessFilter });
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (Array.isArray(items)) {
      const nextExpenseType = expense_type !== undefined ? expense_type : expense.expense_type;
      const businessId = expense.businessId || businessFilter.businessId || req.body?.businessId;
      const expenseRule = await resolveExpenseRule(req, businessId, nextExpenseType);
      if (!expenseRule?.key) {
        return res.status(400).json({ message: "Invalid expense type" });
      }

      const normalizedItems = items
        .map((row) => ({
          item_name: normalizeText(row?.item_name),
          quantity: toNum(row?.quantity),
          rate: toNum(row?.rate),
          amount: toNum(row?.amount),
        }))
        .filter((row) => row.item_name && ((row.quantity > 0 && row.rate > 0) || row.amount > 0));

      if (normalizedItems.length === 0) {
        return res.status(400).json({ message: "At least one valid expense item is required" });
      }

      let nextFixedSource = expenseRule.is_fixed ? (expenseRule.requires_supplier ? "supplier" : "cash") : "";

      let supplierObjectId = null;
      let supplierName = "";
      const requiresSupplier = expenseRule.requires_supplier;

      if (requiresSupplier) {
        const nextSupplierId = supplier_id || expense.supplier_id;
        if (!nextSupplierId || !mongoose.Types.ObjectId.isValid(nextSupplierId)) {
          return res.status(400).json({ message: "Valid supplier is required" });
        }
        const supplier = await Supplier.findOne({ _id: nextSupplierId, ...businessFilter })
          .select("_id name assigned_expense_items")
          .lean();
        if (!supplier) return res.status(404).json({ message: "Supplier not found" });

        const validation = validateSupplierExpenseItems(supplier, normalizedItems);
        if (!validation.ok) {
          return res.status(400).json({
            message: `Selected items are not assigned to this supplier: ${validation.invalidItems.join(", ")}`,
          });
        }
        supplierObjectId = supplier._id;
        supplierName = supplier.name;
      }

      if (expenseRule.is_fixed && expenseRule.key === "fixed") {
        const fixedMeta = await resolveFixedExpenseMeta(businessFilter, normalizedItems);
        if (!fixedMeta.ok) {
          return res.status(400).json({ message: fixedMeta.message });
        }
        nextFixedSource = fixedMeta.fixedSource;
        supplierObjectId = fixedMeta.supplierId && mongoose.Types.ObjectId.isValid(fixedMeta.supplierId)
          ? new mongoose.Types.ObjectId(fixedMeta.supplierId)
          : null;
        supplierName = fixedMeta.supplierName || "";
      }

      let nextMonth = normalizeMonth(month || expense.month || "");
      let nextDate = expense.date;

      if (expenseRule.is_fixed) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) {
          return res.status(400).json({ message: "Month must be in YYYY-MM format" });
        }
        nextDate = parseDate(date || `${nextMonth}-01`, nextMonth);
      } else {
        nextDate = parseDate(date || expense.date, null);
        const monthSource = nextDate || parseDate(expense.date, null) || new Date();
        nextMonth = monthSource.toISOString().slice(0, 7);
      }

      if (!nextDate) return res.status(400).json({ message: "Valid date/month is required" });

      const docs = normalizedItems.map((row) => {
        const derivedAmount = row.quantity > 0 && row.rate > 0 ? row.quantity * row.rate : row.amount;
        return {
          item_name: row.item_name,
          quantity: row.quantity,
          rate: row.rate,
          amount: derivedAmount > 0 ? derivedAmount : row.amount,
        };
      }).filter((row) => row.amount > 0);

      if (docs.length === 0) {
        return res.status(400).json({ message: "At least one valid expense item is required" });
      }

      const totalQuantity = docs.reduce((sum, row) => sum + toNum(row.quantity), 0);
      const totalAmount = docs.reduce((sum, row) => sum + toNum(row.amount), 0);
      const itemsCount = docs.length;
      const summaryTitle = itemsCount > 1 ? `${itemsCount} items` : docs[0]?.item_name || "Expense";
      const avgRate = totalQuantity > 0 ? totalAmount / totalQuantity : totalAmount;

      expense.expense_type = expenseRule.is_fixed ? "fixed" : expenseRule.key;
      expense.fixed_source = nextFixedSource;
      expense.supplier_id = supplierObjectId;
      expense.supplier_name = supplierName;
      expense.date = nextDate;
      expense.month = nextMonth;
      expense.reference_no = reference_no !== undefined ? normalizeText(reference_no) : expense.reference_no;
      expense.remarks = remarks !== undefined ? normalizeText(remarks) : expense.remarks;
      expense.items = docs;
      expense.items_count = itemsCount;
      expense.total_quantity = totalQuantity;
      expense.total_amount = totalAmount;
      expense.item_name = summaryTitle;
      expense.quantity = totalQuantity;
      expense.rate = avgRate;
      expense.amount = totalAmount;

      await expense.save();
      return res.json({ success: true, data: expense });
    }

    if (item_name !== undefined) {
      const val = normalizeText(item_name);
      if (!val) return res.status(400).json({ message: "Item name is required" });
      expense.item_name = val;
    }

    if (quantity !== undefined) {
      const parsedQuantity = toNum(quantity);
      if (parsedQuantity < 0) return res.status(400).json({ message: "Quantity must be 0 or greater" });
      expense.quantity = parsedQuantity;
    }

    if (rate !== undefined) {
      const parsedRate = toNum(rate);
      if (parsedRate < 0) return res.status(400).json({ message: "Rate must be 0 or greater" });
      expense.rate = parsedRate;
    }

    if (amount !== undefined) {
      const parsedAmount = toNum(amount);
      if (parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }
      expense.amount = parsedAmount;
    } else if (quantity !== undefined || rate !== undefined) {
      const derivedAmount = toNum(expense.quantity) * toNum(expense.rate);
      if (derivedAmount > 0) expense.amount = derivedAmount;
    }

    if (date !== undefined) {
      if (!date || Number.isNaN(new Date(date).getTime())) {
        return res.status(400).json({ message: "Valid date is required" });
      }
      expense.date = new Date(date);
      expense.month = String(date).slice(0, 7);
    }

    if (reference_no !== undefined) expense.reference_no = normalizeText(reference_no);
    if (remarks !== undefined) expense.remarks = normalizeText(remarks);

    await expense.save();
    return res.json({ success: true, data: expense });
  } catch (err) {
    console.error("updateExpense:", err);
    return res.status(500).json({ message: "Failed to update expense" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req, req.body?.businessId || req.query?.businessId);
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, ...businessFilter });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    return res.json({ success: true, id: expense._id });
  } catch (err) {
    console.error("deleteExpense:", err);
    return res.status(500).json({ message: "Failed to delete expense" });
  }
};
