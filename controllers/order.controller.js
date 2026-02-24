import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";

function toNum(val) {
  if (val === "" || val == null) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function roundDown(value, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

function computeDesignStitches(s) {
  s = toNum(s);
  if (s <= 0) return 0;
  if (s <= 4237) return 5000;
  if (s <= 10000) return s + (s * 18) / 100;
  if (s <= 50000) return s + (s * 10) / 100;
  return s + (s * 5) / 100;
}

function computeCalculatedRate(baseRate, ds, apqChr) {
  if (toNum(ds) <= 0) return 0;
  const raw = (toNum(baseRate) * toNum(ds)) / 1000 + toNum(apqChr);
  return Math.round(raw * 100) / 100;
}

function computeStitchRate(rate, ds, apq, apqChr) {
  const d = toNum(ds);
  const r = toNum(rate);
  if (d <= 0 || r <= 0) return 0;
  const base = toNum(apq) === 0 ? r : r - toNum(apqChr);
  return roundDown((base / d) * 1000, 2);
}

function computeDesignStitchFromRate(rate, stitchRate, apqChr) {
  const r = toNum(rate);
  const sr = toNum(stitchRate);
  const ac = toNum(apqChr);
  if (r <= 0 || sr <= 0) return 0;
  return roundDown(((r - ac) / sr) * 1000, 2);
}

function computeQtPcs(qty, unit) {
  return unit === "Dzn" ? toNum(qty) * 12 : toNum(qty);
}

function computeTotalAmount(rate, qtPcs) {
  return roundDown(toNum(rate) * toNum(qtPcs), 2);
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

async function buildOrderPayload(body) {
  const {
    customer_id,
    customer_name,
    customer_base_rate,
    description,
    date,
    machine_no,
    lot_no,
    unit,
    quantity,
    actual_stitches,
    apq,
    apq_chr,
    reverse_mode,
    two_side,
    rate_input,
    rate,
  } = body;

  let resolvedCustomerName = customer_name || "";
  let resolvedCustomerBaseRate = toNum(customer_base_rate);

  if (customer_id && mongoose.Types.ObjectId.isValid(customer_id)) {
    const customer = await Customer.findById(customer_id).select("name rate").lean();
    if (customer) {
      resolvedCustomerName = customer.name || resolvedCustomerName;
      resolvedCustomerBaseRate = toNum(customer.rate);
    }
  }

  const resolvedUnit = unit === "Pcs" ? "Pcs" : "Dzn";
  const resolvedQty = toNum(quantity);
  const resolvedActualStitches = toNum(actual_stitches);
  const resolvedApq = apq === "" || apq == null ? null : Math.max(0, Math.min(30, Math.floor(toNum(apq))));
  const resolvedApqChr = apq_chr === "" || apq_chr == null ? null : Math.max(0, toNum(apq_chr));
  const resolvedReverseMode = toBool(reverse_mode, false);
  const resolvedTwoSide = toBool(two_side, false);
  const resolvedRateInput = Math.max(0, toNum(rate_input ?? rate));
  const resolvedRate =
    !resolvedReverseMode && resolvedTwoSide
      ? roundDown(resolvedRateInput * 2, 2)
      : resolvedRateInput;
  const rateForDesignStitch = resolvedTwoSide ? resolvedRateInput / 2 : resolvedRateInput;
  const design_stitches = resolvedReverseMode
    ? computeDesignStitchFromRate(rateForDesignStitch, resolvedCustomerBaseRate, resolvedApqChr)
    : computeDesignStitches(resolvedActualStitches);
  const qt_pcs = computeQtPcs(resolvedQty, resolvedUnit);
  const calculated_rate = computeCalculatedRate(resolvedCustomerBaseRate, design_stitches, resolvedApqChr);
  const stitch_rate = computeStitchRate(resolvedRate, design_stitches, resolvedApq, resolvedApqChr);
  const total_amount = computeTotalAmount(resolvedRate, qt_pcs);

  return {
    customer_id,
    customer_name: resolvedCustomerName,
    customer_base_rate: resolvedCustomerBaseRate,
    description: description || "",
    date: new Date(date),
    machine_no,
    lot_no: lot_no || "",
    unit: resolvedUnit,
    quantity: resolvedQty,
    qt_pcs,
    actual_stitches: resolvedActualStitches,
    design_stitches,
    apq: resolvedApq,
    apq_chr: resolvedApqChr,
    reverse_mode: resolvedReverseMode,
    two_side: resolvedTwoSide,
    rate_input: resolvedRateInput,
    rate: resolvedRate,
    calculated_rate,
    stitch_rate,
    total_amount,
  };
}

export const createOrder = async (req, res) => {
  try {
    const { customer_id, date, machine_no } = req.body;

    if (!customer_id || !mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({ message: "Valid customer_id is required" });
    }
    if (!date) return res.status(400).json({ message: "Date is required" });
    if (!machine_no) return res.status(400).json({ message: "Machine number is required" });

    const payload = await buildOrderPayload(req.body);
    const order = await Order.create({
      ...payload,
      businessId: req.body.businessId,
    });

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("createOrder:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
};

export const getOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      customer_name,
      machine_no,
      date_from,
      date_to,
      businessId,
    } = req.query;

    const filter = {
      ...getBusinessFilter(req, businessId),
    };

    if (customer_name && customer_name.trim()) {
      filter.customer_name = { $regex: customer_name.trim(), $options: "i" };
    }
    if (machine_no && machine_no.trim()) {
      filter.machine_no = { $regex: machine_no.trim(), $options: "i" };
    }
    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to) filter.date.$lte = new Date(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Order.countDocuments(filter);
    const data = await Order.find(filter)
      .sort({ date: -1, createdAt: -1 })
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
    console.error("getOrders:", err);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const getOrderStats = async (req, res) => {
  try {
    const { customer_name, machine_no, date_from, date_to, businessId } = req.query;

    const match = {
      ...getBusinessFilter(req, businessId),
    };

    if (customer_name && customer_name.trim()) {
      match.customer_name = { $regex: customer_name.trim(), $options: "i" };
    }
    if (machine_no && machine_no.trim()) {
      match.machine_no = { $regex: machine_no.trim(), $options: "i" };
    }
    if (date_from || date_to) {
      match.date = {};
      if (date_from) match.date.$gte = new Date(date_from);
      if (date_to) match.date.$lte = new Date(date_to);
    }

    const [totalOrders, summary] = await Promise.all([
      Order.countDocuments(match),
      Order.aggregate([
        { $match: match },
        { $group: { _id: null, total_amount: { $sum: "$total_amount" } } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        total_orders: totalOrders,
        total_amount: summary[0]?.total_amount || 0,
      },
    });
  } catch (err) {
    console.error("getOrderStats:", err);
    return res.status(500).json({ message: "Failed to fetch order stats" });
  }
};

export const getOrder = async (req, res) => {
  try {
    const scope = getBusinessFilter(req, req.query.businessId);
    const order = await Order.findOne({ _id: req.params.id, ...scope }).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("getOrder:", err);
    return res.status(500).json({ message: "Failed to fetch order" });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const scope = getBusinessFilter(req, req.query.businessId);
    const existing = await Order.findOne({ _id: req.params.id, ...scope });
    if (!existing) return res.status(404).json({ message: "Order not found" });

    const payload = await buildOrderPayload({
      ...existing.toObject(),
      ...req.body,
      customer_id: req.body.customer_id || existing.customer_id,
      date: req.body.date || existing.date,
      machine_no: req.body.machine_no || existing.machine_no,
    });

    Object.assign(existing, payload);
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("updateOrder:", err);
    return res.status(500).json({ message: "Failed to update order" });
  }
};
