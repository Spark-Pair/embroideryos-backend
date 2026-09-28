import mongoose from "mongoose";
import StaffRecord from "../models/StaffRecord.js";
import ProductionConfig from "../models/ProductionConfig.js";
import Staff from "../models/Staff.js";
import {
  DEFAULT_PAYOUT_MODE,
  PAYOUT_MODES,
  calculateProductionRow,
  calculateProductionTotals,
  getTargetProgress,
  calculateAutoBonusQty,
  isTargetMode,
  normalizeProductionConfig,
  shouldShowProductionAmount,
} from "../utils/productionPayout.js";
import {
  ATTENDANCE_ALLOWANCE_CODES,
  ATTENDANCE_PAY_MODES,
  getAttendanceRule,
  getBusinessRuleContextByBusinessId,
} from "../utils/businessRuleData.js";

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

const parseDateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return endOfDay
      ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999))
      : new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return endOfDay ? new Date(date.setUTCHours(23, 59, 59, 999)) : date;
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

function calcRow(row, config) {
  return calculateProductionRow(row, config);
}

function calcTotals(rows, config) {
  return calculateProductionTotals(rows, config);
}

const buildEffectivePercentExpr = () => ({
  $cond: [
    { $ne: ["$fix_amount", null] },
    null,
    {
      $cond: [
        {
          $ne: [
            { $ifNull: ["$config_snapshot.payout_mode", DEFAULT_PAYOUT_MODE] },
            PAYOUT_MODES.TARGET_DUAL_PCT,
          ],
        },
        {
          $cond: [
            {
              $eq: [
                { $ifNull: ["$config_snapshot.payout_mode", DEFAULT_PAYOUT_MODE] },
                PAYOUT_MODES.SINGLE_PCT,
              ],
            },
            { $ifNull: ["$config_snapshot.production_pct", null] },
            null,
          ],
        },
        {
          $cond: [
            { $gt: [{ $ifNull: ["$totals.on_target_amt", 0] }, 0] },
            {
              $cond: [
                {
                  $or: [
                    {
                      $gte: [
                        { $ifNull: ["$totals.on_target_amt", 0] },
                        { $ifNull: ["$config_snapshot.target_amount", 0] },
                      ],
                    },
                    { $eq: [{ $ifNull: ["$force_after_target_for_non_target", false] }, true] },
                    { $eq: [{ $ifNull: ["$force_full_target_for_non_target", false] }, true] },
                  ],
                },
                { $ifNull: ["$config_snapshot.after_target_pct", null] },
                { $ifNull: ["$config_snapshot.on_target_pct", null] },
              ],
            },
            null,
          ],
        },
      ],
    },
  ],
});

// ─── Base amount logic ────────────────────────────────────────────────────────
/**
 * Returns { base_amount, resolvedAttendance }
 * resolvedAttendance may differ from input if Half → Day upgrade happens
 */
function resolveBaseAmount({
  attendance,
  totals,
  salary,
  config,
  attendanceRule,
  forceAfterTargetForNonTarget = false,
  forceFullTargetForNonTarget = false,
}) {
  const normalizedConfig = normalizeProductionConfig(config);
  const targetMode = isTargetMode(normalizedConfig);
  const productionEnabled = shouldShowProductionAmount(normalizedConfig);
  const hasSalary    = salary != null && salary > 0;
  const perDay       = hasSalary ? salary / 30 : 0;
  const perHalfDay   = hasSalary ? salary / 60 : 0;
  const offAmount    = normalizedConfig.off_amount ?? 0;
  const target = getTargetProgress(totals, normalizedConfig, {
    force_after_target_for_non_target: forceAfterTargetForNonTarget,
    force_full_target_for_non_target: forceFullTargetForNonTarget,
  });

  let base_amount        = 0;
  let resolvedAttendance = attendance;

  switch (attendanceRule?.pay_mode) {
    case ATTENDANCE_PAY_MODES.ZERO:
      base_amount = 0;
      break;
    case ATTENDANCE_PAY_MODES.SALARY_DAY_OR_OFF_AMOUNT:
      base_amount = hasSalary ? perDay : offAmount;
      break;
    case ATTENDANCE_PAY_MODES.SALARY_HALF_OR_PRODUCTION:
      if (hasSalary) {
        base_amount = perHalfDay;
      } else {
        base_amount = productionEnabled ? target.effectiveAmount : 0;
        if (targetMode && target.targetMet && attendanceRule?.upgrade_half_to_day) {
          resolvedAttendance = "Day";
        }
      }
      break;
    case ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION:
    default:
      if (hasSalary) {
        base_amount = perDay;
      } else {
        base_amount = productionEnabled ? target.effectiveAmount : 0;
      }
      break;
  }

  return { base_amount, resolvedAttendance };
}

// ─── Build full record payload ────────────────────────────────────────────────

async function buildRecordPayload({
  staff_id,
  date,
  attendance,
  production,
  bonus_qty,
  bonus_rate_override,
  fix_amount,
  config,
  force_after_target_for_non_target = false,
  force_full_target_for_non_target = false,
  businessFilter = {},
  ruleContext,
  staffDataOverride = null,
}) {
  // Fetch staff to get salary
  const staff = staffDataOverride || await Staff.findOne({ _id: staff_id, ...businessFilter }).select("salary category").lean();
  const salary = staff?.salary ?? null;
  const canUseTargetOverrides = !(salary != null && salary > 0);
  const normalizedConfig = normalizeProductionConfig(config);
  const targetMode = isTargetMode(normalizedConfig);

  const attendanceRule = getAttendanceRule(ruleContext, attendance);
  const hasProduction    = Boolean(attendanceRule?.counts_production);
  const cleanRows        = hasProduction ? (production || []) : [];

  // Recalculate rows
  const recalculatedRows = cleanRows.map((row) => {
    const { total_stitch, on_target_amt, after_target_amt, applique_amount, after_target_applique_amount } = calcRow(row, config);
    return {
      d_stitch:         row.d_stitch,
      applique:         row.applique || 0,
      pcs:              row.pcs,
      rounds:           row.rounds,
      total_stitch,
      on_target_amt,
      after_target_amt,
      applique_amount,
      after_target_applique_amount,
    };
  });

  const totals = hasProduction && recalculatedRows.length > 0
    ? calcTotals(recalculatedRows, config)
    : null;
  const useFullTargetForNonTarget =
    targetMode &&
    Boolean(force_full_target_for_non_target) &&
    canUseTargetOverrides &&
    !(getTargetProgress(totals, normalizedConfig).targetMet);
  const useAfterTargetForNonTarget =
    targetMode &&
    Boolean(force_after_target_for_non_target) &&
    canUseTargetOverrides &&
    !useFullTargetForNonTarget;

  const selectedAppliqueAmount = recalculatedRows.reduce((sum, row) => {
    if (normalizedConfig.payout_mode === PAYOUT_MODES.SALARY_BONUS_ONLY) {
      return sum + (Number(row.applique_amount ?? row.on_target_amt) || 0);
    }
    if (normalizedConfig.payout_mode === PAYOUT_MODES.SINGLE_PCT) {
      return sum + (Number(row.applique_amount) || 0);
    }
    const progress = getTargetProgress(totals, normalizedConfig, {
      force_after_target_for_non_target: useAfterTargetForNonTarget,
      force_full_target_for_non_target: useFullTargetForNonTarget,
    });
    return sum + (Number(
      progress.targetMet || progress.forceAfter || progress.forceFull
        ? row.after_target_applique_amount
        : row.applique_amount
    ) || 0);
  }, 0);

  // Base amount + possible attendance upgrade
  const { base_amount, resolvedAttendance } = resolveBaseAmount({
    attendance,
    totals,
    salary,
    config,
    attendanceRule,
    forceAfterTargetForNonTarget: useAfterTargetForNonTarget,
    forceFullTargetForNonTarget: useFullTargetForNonTarget,
  });

  const resolvedAttendanceRule = getAttendanceRule(ruleContext, resolvedAttendance);
  const canHaveBonus = Boolean(resolvedAttendanceRule?.allows_bonus);
  const effectiveBonusRate = bonus_rate_override ?? normalizedConfig.bonus_rate ?? 0;
  const configuredBonusQty = calculateAutoBonusQty(totals, normalizedConfig);
  const effectiveBonusQty  = canHaveBonus
    ? (bonus_qty == null ? configuredBonusQty : Number(bonus_qty) || 0)
    : 0;
  const bonus_amount   = effectiveBonusQty * effectiveBonusRate;

  // Final amount
  const final_amount = fix_amount != null
    ? fix_amount
    : base_amount + bonus_amount + (
        normalizedConfig.payout_mode === PAYOUT_MODES.SALARY_BONUS_ONLY ||
        (salary != null && salary > 0)
          ? selectedAppliqueAmount
          : 0
      );

  return {
    attendance:  resolvedAttendance,
    production:  recalculatedRows,
    totals,
    applique_amount: selectedAppliqueAmount,
    base_amount,
    bonus_qty:   effectiveBonusQty,
    bonus_rate:  effectiveBonusRate,
    bonus_amount,
    fix_amount:  fix_amount ?? null,
    force_after_target_for_non_target: useAfterTargetForNonTarget,
    force_full_target_for_non_target: useFullTargetForNonTarget,
    final_amount,
    config_snapshot: {
      payout_mode:      normalizedConfig.payout_mode,
      stitch_rate:      normalizedConfig.stitch_rate,
      applique_rate:    normalizedConfig.applique_rate,
      on_target_pct:    normalizedConfig.on_target_pct,
      after_target_pct: normalizedConfig.after_target_pct,
      production_pct:   normalizedConfig.production_pct,
      stitch_block_size: normalizedConfig.stitch_block_size,
      amount_per_block: normalizedConfig.amount_per_block,
      pcs_per_round:    normalizedConfig.pcs_per_round,
      target_amount:    normalizedConfig.target_amount,
      off_amount:       normalizedConfig.off_amount,
      bonus_rate:       normalizedConfig.bonus_rate,
      auto_bonus_mode:  normalizedConfig.auto_bonus_mode,
      auto_bonus_threshold: normalizedConfig.auto_bonus_threshold,
      auto_bonus_qty:   normalizedConfig.auto_bonus_qty,
      auto_bonus_enabled: normalizedConfig.auto_bonus_enabled,
      auto_bonus_rules: normalizedConfig.auto_bonus_rules,
      allowance:        normalizedConfig.allowance,
      stitch_cap:       normalizedConfig.stitch_cap,
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
      bonus_qty,
      bonus_rate_override,   // if user manually sets per-bonus rate
      fix_amount,
      force_after_target_for_non_target = false,
      force_full_target_for_non_target = false,
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
    const ruleContext = await getBusinessRuleContextByBusinessId(businessFilter.businessId);

    const payload = await buildRecordPayload({
      staff_id, date, attendance, production,
      bonus_qty, bonus_rate_override, fix_amount, config,
      force_after_target_for_non_target,
      force_full_target_for_non_target,
      businessFilter,
      ruleContext,
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

export const previewStaffRecordRecalculation = async (req, res) => {
  try {
    const { staff_id, month, config_id } = req.body || {};
    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(staff_id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
      return res.status(400).json({ message: "Select a valid staff member and month" });
    }
    if (!mongoose.Types.ObjectId.isValid(config_id)) {
      return res.status(400).json({ message: "Select a saved production config" });
    }
    const [year, monthNumber] = String(month).split("-").map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));

    const config = await ProductionConfig.findOne({ _id: config_id, ...businessFilter }).lean();
    if (!config) return res.status(404).json({ message: "Production config not found" });

    const records = await StaffRecord.find({
      ...businessFilter,
      staff_id: new mongoose.Types.ObjectId(staff_id),
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();
    const staffForMonth = await Staff.findOne({ _id: new mongoose.Types.ObjectId(staff_id), ...businessFilter })
      .select("name salary category")
      .lean();
    const selectedMonthSalary = new Date(`${month}-01T00:00:00.000Z`) >= new Date("2026-09-01T00:00:00.000Z")
      ? Number(staffForMonth?.salary) || 0
      : 0;
    if (staffForMonth) staffForMonth.salary = selectedMonthSalary;
    const ruleContext = await getBusinessRuleContextByBusinessId(
      businessFilter.businessId || config.businessId
    );

    const monthly = new Map();
    const record_results = [];
    for (const record of records) {
      const staff = staffForMonth;
      if (!staff || staff.category === "Cropping") continue;
      const month = new Date(record.date).toISOString().slice(0, 7);
      const key = `${month}:${staff._id}`;
      const row = monthly.get(key) || {
        month,
        staff_id: String(staff._id),
        staff_name: staff.name || "Unknown staff",
        record_count: 0,
        current_amount: 0,
        recalculated_amount: 0,
        current_base_amount: 0,
        recalculated_base_amount: 0,
        current_applique_amount: 0,
        recalculated_applique_amount: 0,
        current_bonus_qty: 0,
        recalculated_bonus_qty: 0,
        current_bonus: 0,
        recalculated_bonus: 0,
        total_stitch: 0,
        applique_amount: 0,
      };

      const recalculated = await buildRecordPayload({
        staff_id: staff._id,
        staffDataOverride: staff,
        date: record.date,
        attendance: record.attendance,
        production: (record.production || []).map(({ d_stitch, applique, pcs, rounds }) => ({
          d_stitch: Number(d_stitch) || 0,
          applique: Number(applique) || 0,
          pcs: Number(pcs) || 0,
          rounds: Number(rounds) || 0,
        })),
        bonus_qty: null,
        bonus_rate_override: null,
        fix_amount: null,
        force_after_target_for_non_target: false,
        force_full_target_for_non_target: false,
        config,
        businessFilter,
        ruleContext,
      });

      row.record_count += 1;
      row.current_amount += Number(record.final_amount) || 0;
      row.recalculated_amount += Number(recalculated.final_amount) || 0;
      row.current_bonus += Number(record.bonus_amount) || 0;
      row.recalculated_bonus += Number(recalculated.bonus_amount) || 0;
      row.current_base_amount += Number(record.base_amount) || 0;
      row.recalculated_base_amount += Number(recalculated.base_amount) || 0;
      row.current_applique_amount += Number(record.applique_amount) || 0;
      row.recalculated_applique_amount += Number(recalculated.applique_amount) || 0;
      row.current_bonus_qty += Number(record.bonus_qty) || 0;
      row.recalculated_bonus_qty += Number(recalculated.bonus_qty) || 0;
      row.total_stitch += Number(recalculated.totals?.total_stitch) || 0;
      row.applique_amount += Number(recalculated.applique_amount) || 0;
      monthly.set(key, row);
      record_results.push({
        _id: record._id,
        date: record.date,
        current: {
          attendance: record.attendance,
          base_amount: Number(record.base_amount) || 0,
          applique_amount: Number(record.applique_amount) || 0,
          bonus_qty: Number(record.bonus_qty) || 0,
          bonus_rate: Number(record.bonus_rate) || 0,
          bonus_amount: Number(record.bonus_amount) || 0,
          final_amount: Number(record.final_amount) || 0,
          fix_amount: record.fix_amount ?? null,
          config_snapshot: record.config_snapshot || null,
        },
        attendance: recalculated.attendance,
        production: recalculated.production,
        totals: recalculated.totals,
        applique_amount: recalculated.applique_amount,
        base_amount: recalculated.base_amount,
        bonus_qty: recalculated.bonus_qty,
        bonus_rate: recalculated.bonus_rate,
        bonus_amount: recalculated.bonus_amount,
        fix_amount: recalculated.fix_amount,
        force_after_target_for_non_target: recalculated.force_after_target_for_non_target,
        force_full_target_for_non_target: recalculated.force_full_target_for_non_target,
        final_amount: recalculated.final_amount,
        production_amount: recalculated.totals?.on_target_amt || 0,
        config_snapshot: recalculated.config_snapshot,
      });
    }

    const rows = Array.from(monthly.values())
      .map((row) => ({ ...row, difference: row.recalculated_amount - row.current_amount }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.staff_name.localeCompare(b.staff_name));
    const summary = rows.reduce((acc, row) => ({
      record_count: acc.record_count + row.record_count,
      current_amount: acc.current_amount + row.current_amount,
      recalculated_amount: acc.recalculated_amount + row.recalculated_amount,
      difference: acc.difference + row.difference,
      total_stitch: acc.total_stitch + row.total_stitch,
      applique_amount: acc.applique_amount + row.applique_amount,
      recalculated_bonus: acc.recalculated_bonus + row.recalculated_bonus,
    }), { record_count: 0, current_amount: 0, recalculated_amount: 0, difference: 0, total_stitch: 0, applique_amount: 0, recalculated_bonus: 0 });

    return res.json({
      success: true,
      data: {
        config: {
          _id: config._id,
          effective_date: config.effective_date,
          payout_mode: config.payout_mode,
          bonus_rate: config.bonus_rate,
          applique_rate: config.applique_rate,
          stitch_cap: config.stitch_cap,
          auto_bonus_rules: config.auto_bonus_rules,
        },
        summary,
        rows,
        record_results,
        note: `Preview only for the selected staff and month. Saved records were not changed. Salary of ${selectedMonthSalary} was used for ${month}; salary starts in September 2026. Production amount is also included when the selected config uses a salary plus production mode.`,
      },
    });
  } catch (err) {
    console.error("previewStaffRecordRecalculation:", err);
    return res.status(500).json({ message: "Failed to preview recalculation" });
  }
};

export const applyStaffRecordRecalculation = async (req, res) => {
  try {
    const { staff_id, month, config_id } = req.body || {};
    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(staff_id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
      return res.status(400).json({ message: "Select a valid staff member and month" });
    }
    if (!mongoose.Types.ObjectId.isValid(config_id)) {
      return res.status(400).json({ message: "Select a saved production config" });
    }
    const [year, monthNumber] = String(month).split("-").map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));

    const config = await ProductionConfig.findOne({ _id: config_id, ...businessFilter }).lean();
    if (!config) return res.status(404).json({ message: "Production config not found" });

    const records = await StaffRecord.find({
      ...businessFilter,
      staff_id: new mongoose.Types.ObjectId(staff_id),
      date: { $gte: from, $lte: to },
    })
      .populate("staff_id", "name salary category")
      .sort({ date: 1 })
      .lean();
    const ruleContext = await getBusinessRuleContextByBusinessId(
      businessFilter.businessId || config.businessId
    );

    const operations = [];
    const updatedRecords = [];
    for (const record of records) {
      const staff = record.staff_id;
      if (!staff || staff.category === "Cropping") continue;
      const recalculated = await buildRecordPayload({
        staff_id: staff._id,
        staffDataOverride: staff,
        date: record.date,
        attendance: record.attendance,
        production: (record.production || []).map(({ d_stitch, applique, pcs, rounds }) => ({
          d_stitch: Number(d_stitch) || 0,
          applique: Number(applique) || 0,
          pcs: Number(pcs) || 0,
          rounds: Number(rounds) || 0,
        })),
        bonus_qty: null,
        bonus_rate_override: null,
        fix_amount: null,
        force_after_target_for_non_target: false,
        force_full_target_for_non_target: false,
        config,
        businessFilter,
        ruleContext,
      });

      operations.push({
        updateOne: {
          filter: { _id: record._id, ...businessFilter },
          update: {
            $set: {
              attendance: recalculated.attendance,
              production: recalculated.production,
              totals: recalculated.totals,
              applique_amount: recalculated.applique_amount,
              base_amount: recalculated.base_amount,
              bonus_qty: recalculated.bonus_qty,
              bonus_rate: recalculated.bonus_rate,
              bonus_amount: recalculated.bonus_amount,
              fix_amount: null,
              force_after_target_for_non_target: recalculated.force_after_target_for_non_target,
              force_full_target_for_non_target: recalculated.force_full_target_for_non_target,
              final_amount: recalculated.final_amount,
              config_snapshot: recalculated.config_snapshot,
              updatedAt: new Date(),
            },
          },
        },
      });
      updatedRecords.push({
        _id: record._id,
        date: record.date,
        attendance: recalculated.attendance,
        production: recalculated.production,
        totals: recalculated.totals,
        applique_amount: recalculated.applique_amount,
        base_amount: recalculated.base_amount,
        bonus_qty: recalculated.bonus_qty,
        bonus_rate: recalculated.bonus_rate,
        bonus_amount: recalculated.bonus_amount,
        fix_amount: recalculated.fix_amount,
        force_after_target_for_non_target: recalculated.force_after_target_for_non_target,
        force_full_target_for_non_target: recalculated.force_full_target_for_non_target,
        final_amount: recalculated.final_amount,
        config_snapshot: recalculated.config_snapshot,
      });
    }

    if (operations.length) await StaffRecord.bulkWrite(operations, { ordered: true });
    return res.json({
      success: true,
      data: {
        applied_records: operations.length,
        record_results: updatedRecords,
        config: {
          _id: config._id,
          effective_date: config.effective_date,
          payout_mode: config.payout_mode,
          bonus_rate: config.bonus_rate,
          applique_rate: config.applique_rate,
          stitch_cap: config.stitch_cap,
        },
      },
    });
  } catch (err) {
    console.error("applyStaffRecordRecalculation:", err);
    return res.status(500).json({ message: "Failed to apply recalculation" });
  }
};

export const getStaffRecords = async (req, res) => {
  try {
    const { page = 1, limit = 30, staff_id, attendance, percent, date_from, date_to } = req.query;
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
    if (percent !== undefined && percent !== "") {
      const percentValue = Number(percent);
      if (!Number.isFinite(percentValue)) {
        return res.status(400).json({ message: "Invalid percent filter" });
      }
      filter.$expr = { $eq: [buildEffectivePercentExpr(), percentValue] };
    }
    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = parseDateBoundary(date_from);
      if (date_to)   filter.date.$lte = parseDateBoundary(date_to, true);
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
      force_after_target_for_non_target,
      force_full_target_for_non_target,
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
    const ruleContext = await getBusinessRuleContextByBusinessId(record.businessId);

    const payload = await buildRecordPayload({
      staff_id:   record.staff_id,
      date:       record.date,
      attendance,
      production,
      bonus_qty:  bonus_qty ?? record.bonus_qty,
      bonus_rate_override: bonus_rate_override ?? record.bonus_rate,
      fix_amount: fix_amount !== undefined ? fix_amount : record.fix_amount,
      force_after_target_for_non_target:
        force_after_target_for_non_target !== undefined
          ? force_after_target_for_non_target
          : record.force_after_target_for_non_target,
      force_full_target_for_non_target:
        force_full_target_for_non_target !== undefined
          ? force_full_target_for_non_target
          : record.force_full_target_for_non_target,
      config,
      businessFilter,
      ruleContext,
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
    const { staff_id, attendance, percent, date_from, date_to } = req.query;
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
    if (attendance) {
      matchStage.attendance = attendance;
    }
    if (percent !== undefined && percent !== "") {
      const percentValue = Number(percent);
      if (!Number.isFinite(percentValue)) {
        return res.status(400).json({ message: "Invalid percent filter" });
      }
      matchStage.$expr = { $eq: [buildEffectivePercentExpr(), percentValue] };
    }
    if (date_from || date_to) {
      matchStage.date = {};
      if (date_from) matchStage.date.$gte = parseDateBoundary(date_from);
      if (date_to)   matchStage.date.$lte = parseDateBoundary(date_to, true);
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
