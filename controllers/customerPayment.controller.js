import mongoose from "mongoose";
import CustomerPayment from "../models/CustomerPayment.js";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";

const PAYMENT_METHODS = new Set(["cash", "cheque", "slip", "online", "adjustment"]);

const normalizeMonth = (month) => (typeof month === "string" ? month.trim() : "");
const normalizeText = (val) => (typeof val === "string" ? val.trim() : "");

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

const validateByMethod = ({ method, referenceNo, bankName, partyName, chequeDate, clearDate }) => {
  if (method === "online") {
    if (!referenceNo) return "Reference number is required for online payments";
    if (!bankName) return "Bank name is required for online payments";
  }

  if (method === "cheque") {
    if (!referenceNo) return "Reference number is required for cheque payments";
    if (!bankName) return "Bank name is required for cheque payments";
    if (!chequeDate) return "Cheque date is required for cheque payments";
    if (!clearDate) return "Clear date is required for cheque payments";
    if (new Date(clearDate) < new Date(chequeDate)) {
      return "Clear date must be greater than or equal to cheque date";
    }
  }

  if (method === "slip") {
    if (!referenceNo) return "Reference number is required for slip payments";
    if (!partyName) return "Party name is required for slip payments";
    if (!chequeDate) return "Slip date is required for slip payments";
    if (!clearDate) return "Clear date is required for slip payments";
    if (new Date(clearDate) < new Date(chequeDate)) {
      return "Clear date must be greater than or equal to slip date";
    }
  }

  return "";
};

export const createCustomerPayment = async (req, res) => {
  try {
    const {
      customer_id,
      date,
      month,
      method,
      reference_no,
      bank_name,
      party_name,
      cheque_date,
      clear_date,
      remarks,
    } = req.body;

    const amount = Number(req.body.amount);

    if (!mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({ message: "Invalid customer_id" });
    }

    const normalizedMonth = normalizeMonth(month);
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

    const referenceNo = normalizeText(reference_no);
    const bankName = normalizeText(bank_name);
    const partyName = normalizeText(party_name);

    const methodError = validateByMethod({
      method,
      referenceNo,
      bankName,
      partyName,
      chequeDate: cheque_date,
      clearDate: clear_date,
    });
    if (methodError) {
      return res.status(400).json({ message: methodError });
    }

    const businessFilter = buildBusinessFilter(req);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    const customerQuery = { _id: customer_id, ...businessFilter };
    const customer = await Customer.findOne(customerQuery).select("_id name").lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const payment = await CustomerPayment.create({
      customer_id,
      customer_name: customer.name,
      date: new Date(date),
      month: normalizedMonth,
      method,
      amount,
      reference_no: referenceNo,
      bank_name: bankName,
      party_name: partyName,
      cheque_date: cheque_date ? new Date(cheque_date) : null,
      clear_date: clear_date ? new Date(clear_date) : null,
      remarks: normalizeText(remarks),
      businessId,
    });

    const populated = await CustomerPayment.findById(payment._id).populate(
      "customer_id",
      "name person opening_balance"
    );

    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("createCustomerPayment:", err);
    return res.status(500).json({ message: "Failed to create customer payment" });
  }
};

export const updateCustomerPayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const {
      customer_id,
      date,
      month,
      method,
      reference_no,
      bank_name,
      party_name,
      cheque_date,
      clear_date,
      remarks,
    } = req.body;

    const amount = Number(req.body.amount);

    if (!mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({ message: "Invalid customer_id" });
    }

    const normalizedMonth = normalizeMonth(month);
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

    const referenceNo = normalizeText(reference_no);
    const bankName = normalizeText(bank_name);
    const partyName = normalizeText(party_name);

    const methodError = validateByMethod({
      method,
      referenceNo,
      bankName,
      partyName,
      chequeDate: cheque_date,
      clearDate: clear_date,
    });
    if (methodError) {
      return res.status(400).json({ message: methodError });
    }

    const businessFilter = buildBusinessFilter(req);
    const paymentQuery = { _id: id, ...businessFilter };
    const payment = await CustomerPayment.findOne(paymentQuery);
    if (!payment) {
      return res.status(404).json({ message: "Customer payment not found" });
    }

    const customerQuery = { _id: customer_id, ...businessFilter };
    const customer = await Customer.findOne(customerQuery).select("_id name").lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    payment.customer_id = customer_id;
    payment.customer_name = customer.name;
    payment.date = new Date(date);
    payment.month = normalizedMonth;
    payment.method = method;
    payment.amount = amount;
    payment.reference_no = referenceNo;
    payment.bank_name = bankName;
    payment.party_name = partyName;
    payment.cheque_date = cheque_date ? new Date(cheque_date) : null;
    payment.clear_date = clear_date ? new Date(clear_date) : null;
    payment.remarks = normalizeText(remarks);

    await payment.save();

    const populated = await CustomerPayment.findById(payment._id).populate(
      "customer_id",
      "name person opening_balance"
    );

    return res.json({ success: true, data: populated });
  } catch (err) {
    console.error("updateCustomerPayment:", err);
    return res.status(500).json({ message: "Failed to update customer payment" });
  }
};

export const getCustomerPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      customer_id,
      method,
      month,
      date_from,
      date_to,
      name,
    } = req.query;

    const filter = buildBusinessFilter(req);

    if (customer_id && mongoose.Types.ObjectId.isValid(customer_id)) {
      filter.customer_id = new mongoose.Types.ObjectId(customer_id);
    }

    if (method && PAYMENT_METHODS.has(method)) {
      filter.method = method;
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
      const customerFilter = {
        name: { $regex: name.trim(), $options: "i" },
      };

      if (filter.businessId) {
        customerFilter.businessId = filter.businessId;
      }

      const customerIds = await Customer.find(customerFilter).distinct("_id");
      if (filter.customer_id instanceof mongoose.Types.ObjectId) {
        filter.customer_id = customerIds.some((id) => id.equals(filter.customer_id))
          ? filter.customer_id
          : { $in: [] };
      } else {
        filter.customer_id = { $in: customerIds };
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 30, 1);
    const skip = (pageNum - 1) * limitNum;

    const [total, payments] = await Promise.all([
      CustomerPayment.countDocuments(filter),
      CustomerPayment.find(filter)
        .populate("customer_id", "name person opening_balance")
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
    console.error("getCustomerPayments:", err);
    return res.status(500).json({ message: "Failed to fetch customer payments" });
  }
};

export const getCustomerPaymentStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);

    const [stats] = await CustomerPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          cash: {
            $sum: {
              $cond: [{ $eq: ["$method", "cash"] }, 1, 0],
            },
          },
          cheque: {
            $sum: {
              $cond: [{ $eq: ["$method", "cheque"] }, 1, 0],
            },
          },
          slip: {
            $sum: {
              $cond: [{ $eq: ["$method", "slip"] }, 1, 0],
            },
          },
          online: {
            $sum: {
              $cond: [{ $eq: ["$method", "online"] }, 1, 0],
            },
          },
          adjustment: {
            $sum: {
              $cond: [{ $eq: ["$method", "adjustment"] }, 1, 0],
            },
          },
          total_amount: { $sum: "$amount" },
        },
      },
    ]);

    return res.json({
      success: true,
      data: stats || {
        total: 0,
        cash: 0,
        cheque: 0,
        slip: 0,
        online: 0,
        adjustment: 0,
        total_amount: 0,
      },
    });
  } catch (err) {
    console.error("getCustomerPaymentStats:", err);
    return res.status(500).json({ message: "Failed to fetch customer payment stats" });
  }
};

export const getCustomerPaymentMonths = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req);

    const months = await CustomerPayment.distinct("month", filter);
    months.sort((a, b) => (a < b ? 1 : -1));

    return res.json({
      success: true,
      data: months,
    });
  } catch (err) {
    console.error("getCustomerPaymentMonths:", err);
    return res.status(500).json({ message: "Failed to fetch customer payment months" });
  }
};

export const getCustomerStatement = async (req, res) => {
  try {
    const { customer_id, date_from, date_to } = req.query;

    if (!customer_id || !mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({ message: "Valid customer_id is required" });
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
    const customerObjectId = new mongoose.Types.ObjectId(customer_id);
    const customer = await Customer.findOne({ _id: customerObjectId, ...businessFilter })
      .select("_id name person opening_balance")
      .lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const [priorInvoiceAgg, priorPaymentAgg, invoices, payments] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            ...businessFilter,
            customer_id: customerObjectId,
            invoice_date: { $lt: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$total_amount" } } },
      ]),
      CustomerPayment.aggregate([
        {
          $match: {
            ...businessFilter,
            customer_id: customerObjectId,
            date: { $lt: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Invoice.find({
        ...businessFilter,
        customer_id: customerObjectId,
        invoice_date: { $gte: startDate, $lte: endDate },
      })
        .sort({ invoice_date: 1, createdAt: 1, _id: 1 })
        .select("_id invoice_number invoice_date total_amount note order_count createdAt")
        .lean(),
      CustomerPayment.find({
        ...businessFilter,
        customer_id: customerObjectId,
        date: { $gte: startDate, $lte: endDate },
      })
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .select("_id date method amount reference_no bank_name party_name remarks createdAt")
        .lean(),
    ]);

    const openingBalance =
      Number(customer?.opening_balance || 0) +
      Number(priorInvoiceAgg?.[0]?.total || 0) -
      Number(priorPaymentAgg?.[0]?.total || 0);

    const rows = [
      ...invoices.map((inv) => ({
        kind: "invoice",
        _id: inv._id,
        date: inv.invoice_date,
        invoice_number: inv.invoice_number || "",
        details: inv.note || "",
        debit: Number(inv.total_amount || 0),
        credit: 0,
        createdAt: inv.createdAt,
      })),
      ...payments.map((p) => ({
        kind: "payment",
        _id: p._id,
        date: p.date,
        method: p.method,
        reference_no: p.reference_no || "",
        bank_name: p.bank_name || "",
        party_name: p.party_name || "",
        details: p.remarks || "",
        debit: 0,
        credit: Number(p.amount || 0),
        createdAt: p.createdAt,
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
      return {
        ...row,
        balance: running,
      };
    });

    const totalInvoices = statementRows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalPayments = statementRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const closingBalance = openingBalance + totalInvoices - totalPayments;

    return res.json({
      success: true,
      data: {
        customer: {
          _id: customer._id,
          name: customer.name || "",
          person: customer.person || "",
        },
        date_from: date_from,
        date_to: date_to,
        opening_balance: openingBalance,
        total_invoices: totalInvoices,
        total_payments: totalPayments,
        net_change: totalInvoices - totalPayments,
        closing_balance: closingBalance,
        rows: statementRows,
      },
    });
  } catch (err) {
    console.error("getCustomerStatement:", err);
    return res.status(500).json({ message: "Failed to generate customer statement" });
  }
};
