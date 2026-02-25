import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import CustomerPayment from "../models/CustomerPayment.js";
import cloudinary from "../services/cloudinary.js";

const MAX_INVOICE_ORDERS = 7;

function toNum(val) {
  if (val === "" || val == null) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function getBusinessFilter(req, requestedBusinessId) {
  if (req.user?.role !== "developer") {
    return req.user?.businessId
      ? { businessId: new mongoose.Types.ObjectId(req.user.businessId) }
      : {};
  }

  if (requestedBusinessId && mongoose.Types.ObjectId.isValid(requestedBusinessId)) {
    return { businessId: new mongoose.Types.ObjectId(requestedBusinessId) };
  }

  return {};
}

function isValidInvoiceImagePayload(value) {
  if (!value) return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("https://") || value.startsWith("http://")) return true;
  if (!value.startsWith("data:image/")) return false;
  if (!value.includes(";base64,")) return false;
  return value.length <= 8_000_000;
}

export const getInvoiceOrderGroups = async (req, res) => {
  try {
    const scope = getBusinessFilter(req, req.query.businessId);
    const filter = {
      ...scope,
      invoice_id: null,
    };

    if (req.query.customer_name?.trim()) {
      filter.customer_name = { $regex: req.query.customer_name.trim(), $options: "i" };
    }

    const orders = await Order.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .select("_id customer_id customer_name date lot_no machine_no quantity unit qt_pcs rate total_amount")
      .lean();

    const grouped = new Map();

    orders.forEach((order) => {
      const key = String(order.customer_id);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          latest_order_date: order.date,
          total_orders: 1,
          total_amount: toNum(order.total_amount),
          orders: [order],
        });
        return;
      }

      existing.total_orders += 1;
      existing.total_amount += toNum(order.total_amount);
      existing.orders.push(order);
    });

    const data = Array.from(grouped.values()).sort((a, b) => {
      const aTime = new Date(a.latest_order_date).getTime();
      const bTime = new Date(b.latest_order_date).getTime();
      return bTime - aTime;
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getInvoiceOrderGroups:", err);
    return res.status(500).json({ message: "Failed to fetch invoice order groups" });
  }
};

export const createInvoice = async (req, res) => {
  try {
    const { customer_id, order_ids, invoice_date, note, image_data } = req.body;

    if (!customer_id || !mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({ message: "Valid customer_id is required" });
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ message: "At least one order must be selected" });
    }
    if (!isValidInvoiceImagePayload(image_data)) {
      return res.status(400).json({ message: "Invalid invoice image (max ~6MB)" });
    }

    const uniqueOrderIds = [...new Set(order_ids.map(String))];
    if (uniqueOrderIds.length > MAX_INVOICE_ORDERS) {
      return res.status(400).json({ message: `Maximum ${MAX_INVOICE_ORDERS} orders allowed in one invoice` });
    }
    const areAllValidOrderIds = uniqueOrderIds.every((id) => mongoose.Types.ObjectId.isValid(id));
    if (!areAllValidOrderIds) {
      return res.status(400).json({ message: "One or more order IDs are invalid" });
    }

    const scope = getBusinessFilter(req, req.query.businessId);
    const orders = await Order.find({
      ...scope,
      _id: { $in: uniqueOrderIds },
      customer_id: new mongoose.Types.ObjectId(customer_id),
      invoice_id: null,
    }).lean();

    if (orders.length !== uniqueOrderIds.length) {
      return res.status(400).json({
        message: "Some selected orders are missing, from another customer, or already invoiced",
      });
    }

    const totalAmount = orders.reduce((sum, order) => sum + toNum(order.total_amount), 0);
    const customerName = orders[0]?.customer_name || "";
    const customer = await Customer.findById(customer_id).select("person").lean();
    const customerPerson = customer?.person || "";
    let invoiceImageUrl = "";

    if (typeof image_data === "string" && image_data.startsWith("data:image/")) {
      const uploaded = await cloudinary.uploader.upload(image_data, {
        folder: "embroideryos/invoice-images",
        resource_type: "image",
      });
      invoiceImageUrl = uploaded.secure_url || "";
    } else if (typeof image_data === "string") {
      invoiceImageUrl = image_data;
    }

    const invoice = await Invoice.create({
      customer_id,
      customer_name: customerName,
      customer_person: customerPerson,
      order_ids: uniqueOrderIds,
      order_count: uniqueOrderIds.length,
      total_amount: totalAmount,
      invoice_date: invoice_date ? new Date(invoice_date) : new Date(),
      image_data: invoiceImageUrl,
      note: typeof note === "string" ? note.trim() : "",
      businessId: req.body.businessId,
    });

    await Order.updateMany(
      { _id: { $in: uniqueOrderIds } },
      { $set: { invoice_id: invoice._id, invoiced_at: invoice.invoice_date } }
    );

    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    console.error("createInvoice:", err);
    return res.status(500).json({ message: "Failed to create invoice" });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      customer_name,
      date_from,
      date_to,
      businessId,
    } = req.query;

    const filter = {
      ...getBusinessFilter(req, businessId),
    };

    if (customer_name?.trim()) {
      filter.customer_name = { $regex: customer_name.trim(), $options: "i" };
    }

    if (date_from || date_to) {
      filter.invoice_date = {};
      if (date_from) filter.invoice_date.$gte = new Date(date_from);
      if (date_to) filter.invoice_date.$lte = new Date(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Invoice.countDocuments(filter);
    const data = await Invoice.find(filter)
      .sort({ invoice_date: -1, createdAt: -1 })
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
    console.error("getInvoices:", err);
    return res.status(500).json({ message: "Failed to fetch invoices" });
  }
};

export const getInvoice = async (req, res) => {
  try {
    const scope = getBusinessFilter(req, req.query.businessId);
    const invoice = await Invoice.findOne({ _id: req.params.id, ...scope }).lean();
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const orders = await Order.find({ _id: { $in: invoice.order_ids } })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const customer = await Customer.findById(invoice.customer_id).select("opening_balance").lean();
    const openingBalance = toNum(customer?.opening_balance);

    const priorInvoices = await Invoice.aggregate([
      {
        $match: {
          ...scope,
          customer_id: new mongoose.Types.ObjectId(invoice.customer_id),
          _id: { $ne: new mongoose.Types.ObjectId(invoice._id) },
          $or: [
            { invoice_date: { $lt: new Date(invoice.invoice_date) } },
            {
              invoice_date: new Date(invoice.invoice_date),
              createdAt: { $lt: new Date(invoice.createdAt) },
            },
            {
              invoice_date: new Date(invoice.invoice_date),
              createdAt: new Date(invoice.createdAt),
              _id: { $lt: new mongoose.Types.ObjectId(invoice._id) },
            },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total_amount" },
        },
      },
    ]);

    const previousInvoicedAmount = toNum(priorInvoices?.[0]?.total);
    const priorPayments = await CustomerPayment.aggregate([
      {
        $match: {
          ...scope,
          customer_id: new mongoose.Types.ObjectId(invoice.customer_id),
          $or: [
            { date: { $lt: new Date(invoice.invoice_date) } },
            {
              date: new Date(invoice.invoice_date),
              createdAt: { $lt: new Date(invoice.createdAt) },
            },
            {
              date: new Date(invoice.invoice_date),
              createdAt: new Date(invoice.createdAt),
              _id: { $lt: new mongoose.Types.ObjectId(invoice._id) },
            },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const previousPaymentAmount = toNum(priorPayments?.[0]?.total);
    const outstandingBalance = openingBalance + previousInvoicedAmount - previousPaymentAmount;
    const newBalance = outstandingBalance + toNum(invoice.total_amount);

    return res.json({
      success: true,
      data: {
        ...invoice,
        orders,
        opening_balance: openingBalance,
        paid_before_invoice: previousPaymentAmount,
        outstanding_balance: outstandingBalance,
        new_balance: newBalance,
      },
    });
  } catch (err) {
    console.error("getInvoice:", err);
    return res.status(500).json({ message: "Failed to fetch invoice" });
  }
};
