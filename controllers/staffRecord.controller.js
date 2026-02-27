import mongoose from "mongoose";
import StaffRecord from "../models/StaffRecord.js";
import ProductionConfig from "../models/ProductionConfig.js";
import Staff from "../models/Staff.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const NO_PRODUCTION   = new Set(["Absent", "Off", "Close", "Sunday"]);
const NO_AMOUNT       = new Set(["Absent", "Close"]);  // 0 for everyone
const NO_BONUS        = new Set(["Absent", "Off", "Close", "Sunday"]);
const STITCH_CAP      = 5000;

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

async function getEmbroideryStaffIds(businessFilter = {}) {
  const staffFilter = { ...businessFilter, category: { $ne: "Cropping" } };
  const staff = await Staff.find(staffFilter).select("_id").lean();
  return staff
    .map((item) => item?._id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

// ─── Get config effective for a given date ────────────────────────────────────
// Finds the config whose effective_date is <= recordDate.
// If no effective_date is set on any config, returns the latest one.

async function getConfigForDate(recordDate, businessId) {
  const date = new Date(recordDate);
  const filter = {
    $or: [
      { effective_date: { $lte: date } },
      { effective_date: null },
    ],
  };
  if (businessId) {
    filter.businessId = new mongoose.Types.ObjectId(businessId);
  }

  // Try to find config with effective_date <= recordDate, pick the closest one
  const config = await ProductionConfig.findOne(filter)
    .sort({ effective_date: -1, createdAt: -1 })
    .lean();

  return config;
}

// ─── Production row calculation ───────────────────────────────────────────────

const STITCH_CALC_VALUE = (raw) =>
  raw > 0 && raw <= STITCH_CAP ? STITCH_CAP : raw;

function calcRow(row, config) {
  const d_stitch  = STITCH_CALC_VALUE(row.d_stitch ?? 0);
  const pcs       = row.pcs    || 0;
  const rounds    = row.rounds || 0;
  const applique  = row.applique || 0;

  const { stitch_rate, applique_rate, on_target_pct, after_target_pct } = config;

  const total_stitch     = row.d_stitch * rounds;
  const stitch_base      = d_stitch * stitch_rate * pcs / 100;
  const applique_base    = applique_rate * applique * pcs / 100;
  const combined         = stitch_base + applique_base;
  const on_target_amt    = combined * on_target_pct;
  const after_target_amt = combined * after_target_pct;

  return { total_stitch, on_target_amt, after_target_amt };
}

function calcTotals(rows, config) {
  return rows.reduce(
    (acc, row) => {
      const { total_stitch, on_target_amt, after_target_amt } = calcRow(row, config);
      return {
        pcs:              acc.pcs    + (row.pcs    || 0),
        rounds:           acc.rounds + (row.rounds || 0),
        total_stitch:     acc.total_stitch     + total_stitch,
        on_target_amt:    acc.on_target_amt    + on_target_amt,
        after_target_amt: acc.after_target_amt + after_target_amt,
      };
    },
    { pcs: 0, rounds: 0, total_stitch: 0, on_target_amt: 0, after_target_amt: 0 }
  );
}

// ─── Base amount logic ────────────────────────────────────────────────────────
/**
 * Returns { base_amount, resolvedAttendance }
 * resolvedAttendance may differ from input if Half → Day upgrade happens
 */
function resolveBaseAmount({ attendance, totals, salary, config }) {
  const hasSalary    = salary != null && salary > 0;
  const perDay       = hasSalary ? salary / 30 : 0;
  const perHalfDay   = hasSalary ? salary / 60 : 0;
  const targetAmount = config.target_amount ?? 1000;
  const offAmount    = config.off_amount    ?? 0;

  let base_amount        = 0;
  let resolvedAttendance = attendance;

  if (NO_AMOUNT.has(attendance)) {
    // Absent / Close → 0 for everyone
    base_amount = 0;

  } else if (attendance === "Sunday") {
    base_amount = hasSalary ? perDay : 0;

  } else if (attendance === "Off") {
    base_amount = hasSalary ? perDay : offAmount;

  } else if (attendance === "Half") {
    if (hasSalary) {
      base_amount = perHalfDay;
    } else {
      // Non-salary: use production amount; if on-target → upgrade to Day
      const productionAmt = totals
        ? (totals.on_target_amt >= targetAmount
            ? totals.after_target_amt
            : totals.on_target_amt)
        : 0;

      if (totals && totals.on_target_amt >= targetAmount) {
        resolvedAttendance = "Day"; // upgrade
      }

      base_amount = productionAmt;
    }

  } else {
    // Day / Night
    if (hasSalary) {
      base_amount = perDay;
    } else {
      base_amount = totals
        ? (totals.on_target_amt >= targetAmount
            ? totals.after_target_amt
            : totals.on_target_amt)
        : 0;
    }
  }

  return { base_amount, resolvedAttendance };
}

// ─── Build full record payload ────────────────────────────────────────────────

async function buildRecordPayload({ staff_id, date, attendance, production, bonus_qty, bonus_rate_override, fix_amount, config }) {
  // Fetch staff to get salary
  const staff = await Staff.findById(staff_id).select("salary category").lean();
  const salary = staff?.salary ?? null;

  const hasProduction    = !NO_PRODUCTION.has(attendance);
  const cleanRows        = hasProduction ? (production || []) : [];

  // Recalculate rows
  const recalculatedRows = cleanRows.map((row) => {
    const { total_stitch, on_target_amt, after_target_amt } = calcRow(row, config);
    return {
      d_stitch:         row.d_stitch,
      applique:         row.applique || 0,
      pcs:              row.pcs,
      rounds:           row.rounds,
      total_stitch,
      on_target_amt,
      after_target_amt,
    };
  });

  const totals = hasProduction && recalculatedRows.length > 0
    ? calcTotals(recalculatedRows, config)
    : null;

  // Base amount + possible attendance upgrade
  const { base_amount, resolvedAttendance } = resolveBaseAmount({
    attendance,
    totals,
    salary,
    config,
  });

  // Bonus — not allowed on Absent/Off/Close/Sunday
  const canHaveBonus   = !NO_BONUS.has(resolvedAttendance);
  const effectiveBonusRate = bonus_rate_override ?? config.bonus_rate ?? 200;
  const effectiveBonusQty  = canHaveBonus ? (bonus_qty || 0) : 0;
  const bonus_amount   = effectiveBonusQty * effectiveBonusRate;

  // Final amount
  const final_amount = fix_amount != null
    ? fix_amount
    : base_amount + bonus_amount;

  return {
    attendance:  resolvedAttendance,
    production:  recalculatedRows,
    totals,
    base_amount,
    bonus_qty:   effectiveBonusQty,
    bonus_rate:  effectiveBonusRate,
    bonus_amount,
    fix_amount:  fix_amount ?? null,
    final_amount,
    config_snapshot: {
      stitch_rate:      config.stitch_rate,
      applique_rate:    config.applique_rate,
      on_target_pct:    config.on_target_pct,
      after_target_pct: config.after_target_pct,
      pcs_per_round:    config.pcs_per_round,
      target_amount:    config.target_amount,
      off_amount:       config.off_amount,
      bonus_rate:       config.bonus_rate,
      allowance:        config.allowance,
    },
  };
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export const createStaffRecord = async (req, res) => {
  try {
    const {
      staff_id,
      date,
      attendance,
      production       = [],
      bonus_qty        = 0,
      bonus_rate_override,   // if user manually sets per-bonus rate
      fix_amount,
    } = req.body;
    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Invalid staff_id" });
    }

    const staff = await Staff.findOne({ _id: staff_id, ...businessFilter }).select("_id category");
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }
    if (staff.category === "Cropping") {
      return res.status(400).json({ message: "Cropping staff can only be recorded in CRP Records" });
    }

    const exists = await StaffRecord.findOne({ staff_id, date: new Date(date), ...businessFilter });
    if (exists) {
      return res.status(409).json({ message: "Record already exists for this staff on this date" });
    }

    const config = await getConfigForDate(date, businessFilter.businessId);
    if (!config) {
      return res.status(400).json({ message: "Production config not found. Please set it up first." });
    }

    const payload = await buildRecordPayload({
      staff_id, date, attendance, production,
      bonus_qty, bonus_rate_override, fix_amount, config,
    });

    const record = await StaffRecord.create({
      staff_id,
      date: new Date(date),
      businessId: businessFilter.businessId,
      ...payload,
    });

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("createStaffRecord:", err);
    res.status(500).json({ message: "Failed to create staff record" });
  }
};

// ─── GET ALL ──────────────────────────────────────────────────────────────────

export const getStaffRecords = async (req, res) => {
  try {
    const { page = 1, limit = 30, staff_id, attendance, date_from, date_to } = req.query;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const filter = { ...businessFilter };

    const embroideryStaffIds = await getEmbroideryStaffIds(businessFilter);
    if (embroideryStaffIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 1,
          totalItems: 0,
          itemsPerPage: parseInt(limit),
        },
      });
    }
    filter.staff_id = { $in: embroideryStaffIds };
    if (staff_id && mongoose.Types.ObjectId.isValid(staff_id)) {
      const requestedStaffId = new mongoose.Types.ObjectId(staff_id);
      if (!embroideryStaffIds.some((id) => String(id) === String(requestedStaffId))) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 1,
            totalItems: 0,
            itemsPerPage: parseInt(limit),
          },
        });
      }
      filter.staff_id = requestedStaffId;
    }
    if (attendance) filter.attendance = attendance;
    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to)   filter.date.$lte = new Date(date_to);
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await StaffRecord.countDocuments(filter);

    const records = await StaffRecord.find(filter)
      .populate("staff_id", "name joining_date salary opening_balance")
      .sort({ _id: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: records,
      pagination: {
        currentPage:  parseInt(page),
        totalPages:   Math.ceil(total / parseInt(limit)),
        totalItems:   total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("getStaffRecords:", err);
    res.status(500).json({ message: "Failed to fetch staff records" });
  }
};

// ─── GET SINGLE ───────────────────────────────────────────────────────────────

export const getStaffRecord = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const record = await StaffRecord.findOne({ _id: req.params.id, ...businessFilter })
      .populate("staff_id", "name joining_date salary opening_balance")
      .lean();

    if (!record) return res.status(404).json({ message: "Record not found" });

    res.json({ success: true, data: record });
  } catch (err) {
    console.error("getStaffRecord:", err);
    res.status(500).json({ message: "Failed to fetch staff record" });
  }
};

// ─── GET LAST RECORD DATE ─────────────────────────────────────────────────────

export const getStaffLastRecord = async (req, res) => {
  try {
    const { staff_id } = req.params;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    if (!mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Invalid staff_id" });
    }

    const last = await StaffRecord.findOne({ staff_id, ...businessFilter })
      .sort({ date: -1 })
      .select("date attendance")
      .lean();

    res.json({
      success: true,
      data: last
        ? { last_record_date: last.date, last_attendance: last.attendance }
        : null,
    });
  } catch (err) {
    console.error("getStaffLastRecord:", err);
    res.status(500).json({ message: "Failed to fetch last record" });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateStaffRecord = async (req, res) => {
  try {
    const {
      attendance,
      production       = [],
      bonus_qty,
      bonus_rate_override,
      fix_amount,
    } = req.body;

    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const record = await StaffRecord.findOne({ _id: req.params.id, ...businessFilter });
    if (!record) return res.status(404).json({ message: "Record not found" });

    // Use config for original record date (historical accuracy)
    const config =
      await getConfigForDate(record.date, record.businessId) ||
      await ProductionConfig.findOne({ businessId: record.businessId }).sort({ createdAt: -1 }).lean();

    const payload = await buildRecordPayload({
      staff_id:   record.staff_id,
      date:       record.date,
      attendance,
      production,
      bonus_qty:  bonus_qty ?? record.bonus_qty,
      bonus_rate_override: bonus_rate_override ?? record.bonus_rate,
      fix_amount: fix_amount !== undefined ? fix_amount : record.fix_amount,
      config,
    });

    Object.assign(record, payload);
    await record.save();

    res.json({ success: true, data: record });
  } catch (err) {
    console.error("updateStaffRecord:", err);
    res.status(500).json({ message: "Failed to update staff record" });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const deleteStaffRecord = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const record = await StaffRecord.findOneAndDelete({ _id: req.params.id, ...businessFilter });
    if (!record) return res.status(404).json({ message: "Record not found" });

    res.json({ success: true, message: "Record deleted" });
  } catch (err) {
    console.error("deleteStaffRecord:", err);
    res.status(500).json({ message: "Failed to delete staff record" });
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────────

export const getStaffRecordStats = async (req, res) => {
  try {
    const { staff_id, date_from, date_to } = req.query;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const matchStage = { ...businessFilter };
    const embroideryStaffIds = await getEmbroideryStaffIds(businessFilter);
    if (embroideryStaffIds.length === 0) {
      return res.json({
        success: true,
        data: {
          attendance: {},
          amounts: {
            total_base_amount: 0,
            total_bonus_amount: 0,
            total_final_amount: 0,
            record_count: 0,
          },
        },
      });
    }
    matchStage.staff_id = { $in: embroideryStaffIds };
    if (staff_id && mongoose.Types.ObjectId.isValid(staff_id)) {
      const requestedStaffId = new mongoose.Types.ObjectId(staff_id);
      if (!embroideryStaffIds.some((id) => String(id) === String(requestedStaffId))) {
        return res.json({
          success: true,
          data: {
            attendance: {},
            amounts: {
              total_base_amount: 0,
              total_bonus_amount: 0,
              total_final_amount: 0,
              record_count: 0,
            },
          },
        });
      }
      matchStage.staff_id = requestedStaffId;
    }
    if (date_from || date_to) {
      matchStage.date = {};
      if (date_from) matchStage.date.$gte = new Date(date_from);
      if (date_to)   matchStage.date.$lte = new Date(date_to);
    }

    const [attendanceBreakdown, amountSummary] = await Promise.all([
      StaffRecord.aggregate([
        { $match: matchStage },
        { $group: { _id: "$attendance", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      StaffRecord.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id:                null,
            total_base_amount:  { $sum: "$base_amount" },
            total_bonus_amount: { $sum: "$bonus_amount" },
            total_final_amount: { $sum: "$final_amount" },
            record_count:       { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        attendance: attendanceBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        amounts: amountSummary[0] || {
          total_base_amount:  0,
          total_bonus_amount: 0,
          total_final_amount: 0,
          record_count:       0,
        },
      },
    });
  } catch (err) {
    console.error("getStaffRecordStats:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};

// ─── AVAILABLE MONTHS ────────────────────────────────────────────────────────

export const getStaffRecordMonths = async (req, res) => {
  try {
    const match = buildBusinessFilter(req);
    if (match === null) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const embroideryStaffIds = await getEmbroideryStaffIds(match);
    if (embroideryStaffIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const months = await StaffRecord.aggregate([
      { $match: { ...match, staff_id: { $in: embroideryStaffIds } } },
      {
        $project: {
          _id: 0,
          month: {
            $dateToString: {
              format: "%Y-%m",
              date: "$date",
            },
          },
        },
      },
      { $group: { _id: "$month" } },
      { $sort: { _id: -1 } },
      { $project: { _id: 0, month: "$_id" } },
    ]);

    return res.json({
      success: true,
      data: months.map((m) => m.month),
    });
  } catch (err) {
    console.error("getStaffRecordMonths:", err);
    return res.status(500).json({ message: "Failed to fetch staff record months" });
  }
};
