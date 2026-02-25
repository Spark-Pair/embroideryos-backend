import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";

const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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

export const createSupplier = async (req, res) => {
  try {
    const { name, opening_balance } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Name is required" });

    const supplier = await Supplier.create({
      name: name.trim(),
      opening_balance: parseOpeningBalance(opening_balance),
      businessId: req.body.businessId,
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
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    return res.json(supplier);
  } catch (err) {
    console.error("getSupplier:", err);
    return res.status(500).json({ message: "Failed to fetch supplier" });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { opening_balance } = req.body;

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    if (opening_balance !== undefined) {
      supplier.opening_balance = parseOpeningBalance(opening_balance);
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
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    supplier.isActive = !supplier.isActive;
    await supplier.save();

    return res.json({ id: supplier._id, isActive: supplier.isActive });
  } catch (err) {
    console.error("toggleSupplierStatus:", err);
    return res.status(500).json({ message: "Failed to toggle supplier status" });
  }
};
