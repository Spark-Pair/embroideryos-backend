import mongoose from "mongoose";
import CustomerPayment from "../models/CustomerPayment.js";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import { getBusinessRuleContextByBusinessId, getCustomerPaymentMethodRule } from "../utils/businessRuleData.js";

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

const validateByMethod = ({ methodRule, method, referenceNo, bankName, partyName, chequeDate, clearDate }) => {
  if (methodRule?.requires_reference && !referenceNo) {
    return `Reference number is required for ${method} payments`;
  }
  if (methodRule?.requires_bank && !bankName) {
    return `Bank name is required for ${method} payments`;
  }
  if (methodRule?.requires_party && !partyName) {
    return `Party name is required for ${method} payments`;
  }
  if (methodRule?.requires_issue_date && !chequeDate) {
    return `Issue date is required for ${method} payments`;
  }
  if (methodRule?.allows_clear_date && clearDate && chequeDate && new Date(clearDate) < new Date(chequeDate)) {
    return "Clear date must be greater than or equal to issue date";
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

    if (!normalizeText(method)) {
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

    const businessFilter = buildBusinessFilter(req);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    const ruleContext = await getBusinessRuleContextByBusinessId(businessId);
    const methodRule = getCustomerPaymentMethodRule(ruleContext, method);
    const methodError = validateByMethod({
      methodRule,
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

    if (!normalizeText(method)) {
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

    const businessFilter = buildBusinessFilter(req);
    const paymentQuery = { _id: id, ...businessFilter };
    const payment = await CustomerPayment.findOne(paymentQuery);
    if (!payment) {
      return res.status(404).json({ message: "Customer payment not found" });
    }

    const businessId = payment.businessId || businessFilter.businessId;
    const ruleContext = await getBusinessRuleContextByBusinessId(businessId);
    const methodRule = getCustomerPaymentMethodRule(ruleContext, method);
    const methodError = validateByMethod({
      methodRule,
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

    const [summaryRows, breakdownRows] = await Promise.all([
      CustomerPayment.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            total_amount: { $sum: "$amount" },
          },
        },
      ]),
      CustomerPayment.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$method",
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

    const [priorPaymentAgg, invoicesBefore, invoicesInRange, payments] = await Promise.all([
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
        invoice_date: { $lt: startDate },
      })
        .select("_id invoice_number invoice_date")
        .lean(),
      Invoice.find({
        ...businessFilter,
        customer_id: customerObjectId,
        invoice_date: { $gte: startDate, $lte: endDate },
      })
        .sort({ invoice_date: 1, createdAt: 1, _id: 1 })
        .select("_id invoice_number invoice_date")
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

    const priorInvoiceIds = invoicesBefore.map((inv) => inv._id);
    const inRangeInvoiceIds = invoicesInRange.map((inv) => inv._id);

    const [priorOrdersAgg, ordersInRange] = await Promise.all([
      priorInvoiceIds.length
        ? Order.aggregate([
            {
              $match: {
                ...businessFilter,
                customer_id: customerObjectId,
                invoice_id: { $in: priorInvoiceIds },
              },
            },
            { $group: { _id: null, total: { $sum: "$total_amount" } } },
          ])
        : Promise.resolve([]),
      inRangeInvoiceIds.length
        ? Order.find({
            ...businessFilter,
            customer_id: customerObjectId,
            invoice_id: { $in: inRangeInvoiceIds },
          })
            .sort({ date: 1, createdAt: 1, _id: 1 })
            .select(
              "_id date description machine_no lot_no client_ref unit quantity qt_pcs actual_stitches design_stitches apq apq_chr reverse_mode two_side rate stitch_rate total_amount invoice_id createdAt"
            )
            .lean()
        : Promise.resolve([]),
    ]);

    const invoiceMap = new Map(
      invoicesInRange.map((inv) => [
        String(inv._id),
        { invoice_date: inv.invoice_date, invoice_number: inv.invoice_number || "" },
      ])
    );

    const openingBalance =
      Number(customer?.opening_balance || 0) +
      Number(priorOrdersAgg?.[0]?.total || 0) -
      Number(priorPaymentAgg?.[0]?.total || 0);

    const rows = [
      ...ordersInRange.map((order) => {
        const invoiceMeta = invoiceMap.get(String(order?.invoice_id || "")) || {};
        return {
          kind: "order",
          _id: order._id,
          date: invoiceMeta.invoice_date || order.date,
          invoice_date: invoiceMeta.invoice_date || null,
          order_date: order.date || null,
          invoice_number: invoiceMeta.invoice_number || "",
          description: order.description || "",
          machine_no: order.machine_no || "",
          lot_no: order.lot_no || "",
          client_ref: order.client_ref || "",
          unit: order.unit || "",
          quantity: Number(order.quantity || 0),
          qt_pcs: Number(order.qt_pcs || 0),
          actual_stitches: Number(order.actual_stitches || 0),
          design_stitches: Number(order.design_stitches || 0),
          apq: Number(order.apq || 0),
          apq_chr: Number(order.apq_chr || 0),
          reverse_mode: Boolean(order.reverse_mode),
          two_side: Boolean(order.two_side),
          rate: Number(order.rate || 0),
          stitch_rate: Number(order.stitch_rate || 0),
          debit: Number(order.total_amount || 0),
          credit: 0,
          createdAt: order.createdAt,
        };
      }),
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
