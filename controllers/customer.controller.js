import mongoose from "mongoose";
import Customer from "../models/Customer.js";

const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const resolveBusinessId = (req) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId || null;
  }
  return req.query?.businessId || req.body?.businessId || null;
};

const buildBusinessFilter = (req, allowEmptyForDeveloper = true) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    return allowEmptyForDeveloper && req.user?.role === "developer" ? {} : null;
  }
  if (!mongoose.Types.ObjectId.isValid(businessId)) return null;
  return { businessId: new mongoose.Types.ObjectId(businessId) };
};

// CREATE Customer
export const createCustomer = async (req, res) => {
  try {
    const { name, person, rate, opening_balance } = req.body;
    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const customer = await Customer.create({
      name,
      person,
      rate,
      opening_balance: parseOpeningBalance(opening_balance),
      businessId: businessFilter.businessId,
    });

    res.status(201).json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create customer" });
  }
};

// GET all customers with pagination and filters
export const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status } = req.query;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const filter = { ...businessFilter };

    // Name search filter
    if (name && name.trim()) {
      filter.name = { $regex: name.trim(), $options: 'i' };
    }
    
    // Status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count for pagination
    const total = await Customer.countDocuments(filter);
    
    // Fetch paginated data
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      data: customers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch customers" });
  }
};

export const getCustomersStats = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ success: false, message: "Invalid businessId" });
    }

    const [total, active, inactive] = await Promise.all([
      Customer.countDocuments(businessFilter),
      Customer.countDocuments({ ...businessFilter, isActive: true }),
      Customer.countDocuments({ ...businessFilter, isActive: false }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch stats" 
    });
  }
};

// GET single customer details
export const getCustomer = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const customer = await Customer.findOne({ _id: req.params.id, ...businessFilter });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch customer" });
  }
};

// UPDATE customer
export const updateCustomer = async (req, res) => {
  try {
    const { rate, opening_balance } = req.body;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const customer = await Customer.findOne({ _id: req.params.id, ...businessFilter });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.rate = rate ?? customer.rate;
    if (opening_balance !== undefined) {
      customer.opening_balance = parseOpeningBalance(opening_balance);
    }

    await customer.save();
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update customer" });
  }
};

// TOGGLE Active / Inactive
export const toggleCustomerStatus = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const customer = await Customer.findOne({ _id: req.params.id, ...businessFilter });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.isActive = !customer.isActive;
    await customer.save();

    res.json({ id: customer._id, isActive: customer.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};
