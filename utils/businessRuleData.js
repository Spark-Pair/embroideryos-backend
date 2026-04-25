import Business from "../models/Business.js";
import { defaultAccessRules, hasAccessRuleForRole, normalizeAccessRules } from "./accessConfig.js";

const normalizeText = (value) => String(value || "").trim();
const CANONICAL_EXPENSE_LABELS = {
  supplier: "Supplier",
  cash: "Cash",
  fixed_cash: "Fixed Cash",
  fixed_supplier: "Fixed Supplier",
  fixed: "Fixed",
};
const LEGACY_EXPENSE_LABEL_ALIASES = {
  supplier: new Set(["expense (supplier)", "supplier"]),
  cash: new Set(["expense (cash)", "cash"]),
  fixed_cash: new Set(["fixed expense (cash)", "fixed cash"]),
  fixed_supplier: new Set(["fixed expense (supplier)", "fixed supplier"]),
  fixed: new Set(["fixed expense", "fixed"]),
};

const normalizeExpenseTypeLabel = (key, label) => {
  const cleanKey = normalizeText(key).toLowerCase();
  const cleanLabel = normalizeText(label);
  if (!cleanKey) return cleanLabel;
  const aliases = LEGACY_EXPENSE_LABEL_ALIASES[cleanKey];
  if (!cleanLabel || aliases?.has(cleanLabel.toLowerCase())) {
    return CANONICAL_EXPENSE_LABELS[cleanKey] || cleanLabel;
  }
  return cleanLabel;
};

const uniqueByKey = (rows, getKey) => {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = String(getKey(row) || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const ATTENDANCE_PAY_MODES = {
  ZERO: "zero",
  SALARY_DAY_OR_PRODUCTION: "salary_day_or_production",
  SALARY_HALF_OR_PRODUCTION: "salary_half_or_production",
  SALARY_DAY_OR_OFF_AMOUNT: "salary_day_or_off_amount",
};

export const ATTENDANCE_ALLOWANCE_CODES = {
  NORMAL: "normal",
  HALF: "half",
  ABSENT: "absent",
  IGNORE: "ignore",
};

export const PAYMENT_EFFECT_MODES = {
  SUBTRACT: "subtract",
  ADD: "add",
  IGNORE: "ignore",
};

export const defaultAttendanceRules = (options = []) => {
  const defaults = {
    Day: {
      label: "Day",
      counts_record: true,
      counts_production: true,
      allows_bonus: true,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    },
    Night: {
      label: "Night",
      counts_record: true,
      counts_production: true,
      allows_bonus: true,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    },
    Half: {
      label: "Half",
      counts_record: true,
      counts_production: true,
      allows_bonus: true,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_HALF_OR_PRODUCTION,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.HALF,
      upgrade_half_to_day: true,
    },
    Absent: {
      label: "Absent",
      counts_record: true,
      counts_production: false,
      allows_bonus: false,
      pay_mode: ATTENDANCE_PAY_MODES.ZERO,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.ABSENT,
      upgrade_half_to_day: false,
    },
    Off: {
      label: "Off",
      counts_record: true,
      counts_production: false,
      allows_bonus: false,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_DAY_OR_OFF_AMOUNT,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    },
    Close: {
      label: "Close",
      counts_record: true,
      counts_production: false,
      allows_bonus: false,
      pay_mode: ATTENDANCE_PAY_MODES.ZERO,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    },
    Sunday: {
      label: "Sunday",
      counts_record: true,
      counts_production: false,
      allows_bonus: false,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    },
  };

  const source = Array.isArray(options) && options.length ? options : Object.keys(defaults);
  return source.map((label) => {
    const clean = normalizeText(label);
    return defaults[clean] || {
      label: clean,
      counts_record: true,
      counts_production: true,
      allows_bonus: true,
      pay_mode: ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION,
      allowance_code: ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: false,
    };
  });
};

export const defaultCustomerPaymentMethodRules = (methods = []) => {
  const defaults = {
    cash: {
      method: "cash",
      requires_reference: false,
      requires_bank: false,
      requires_party: false,
      requires_issue_date: false,
      allows_clear_date: false,
    },
    cheque: {
      method: "cheque",
      requires_reference: true,
      requires_bank: true,
      requires_party: false,
      requires_issue_date: true,
      allows_clear_date: true,
    },
    slip: {
      method: "slip",
      requires_reference: true,
      requires_bank: false,
      requires_party: true,
      requires_issue_date: true,
      allows_clear_date: true,
    },
    online: {
      method: "online",
      requires_reference: true,
      requires_bank: false,
      requires_party: false,
      requires_issue_date: false,
      allows_clear_date: false,
    },
    adjustment: {
      method: "adjustment",
      requires_reference: false,
      requires_bank: false,
      requires_party: false,
      requires_issue_date: false,
      allows_clear_date: false,
    },
  };
  const source = Array.isArray(methods) && methods.length ? methods : Object.keys(defaults);
  return source.map((method) => {
    const clean = normalizeText(method);
    const key = clean.toLowerCase();
    return defaults[key] || {
      method: clean,
      requires_reference: false,
      requires_bank: false,
      requires_party: false,
      requires_issue_date: false,
      allows_clear_date: false,
    };
  });
};

export const defaultStaffPaymentTypeRules = (types = []) => {
  const defaults = {
    advance: {
      type: "advance",
      history_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
      current_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
    },
    payment: {
      type: "payment",
      history_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
      current_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
    },
    adjustment: {
      type: "adjustment",
      history_effect: PAYMENT_EFFECT_MODES.ADD,
      current_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
    },
  };
  const source = Array.isArray(types) && types.length ? types : Object.keys(defaults);
  return source.map((type) => {
    const clean = normalizeText(type);
    const key = clean.toLowerCase();
    return defaults[key] || {
      type: clean,
      history_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
      current_effect: PAYMENT_EFFECT_MODES.SUBTRACT,
    };
  });
};

export const defaultExpenseTypeRules = (types = []) => {
  const defaults = {
    supplier: {
      key: "supplier",
      label: "Supplier",
      is_fixed: false,
      requires_supplier: true,
    },
    cash: {
      key: "cash",
      label: "Cash",
      is_fixed: false,
      requires_supplier: false,
    },
    fixed_cash: {
      key: "fixed_cash",
      label: "Fixed Cash",
      is_fixed: true,
      requires_supplier: false,
    },
    fixed_supplier: {
      key: "fixed_supplier",
      label: "Fixed Supplier",
      is_fixed: true,
      requires_supplier: true,
    },
    fixed: {
      key: "fixed",
      label: "Fixed",
      is_fixed: true,
      requires_supplier: false,
    },
  };
  const source = Array.isArray(types) && types.length ? types : Object.keys(defaults);
  return source.map((type) => {
    const clean = normalizeText(type);
    const key = clean.toLowerCase();
    return defaults[key] || {
      key: clean,
      label: clean,
      is_fixed: false,
      requires_supplier: false,
    };
  });
};

export const defaultAllowanceRule = () => ({
  min_records: 26,
  max_absent: 0,
  max_half: 1,
});

export const defaultDisplayPreferences = () => ({
  salary_slip_fields: ["arrears", "amount", "bonus", "allowance", "payments", "gross_total", "deduction_total", "net_amount"],
  dashboard_staff_columns: ["records", "work", "arrears", "allowance", "bonus", "deductions", "balance"],
  label_overrides: [
    { key: "arrears", label: "Arrears" },
    { key: "amount", label: "Amount" },
    { key: "bonus", label: "Bonus" },
    { key: "allowance", label: "Allowance" },
    { key: "payments", label: "Payments" },
    { key: "gross_total", label: "Gross Total (+)" },
    { key: "deduction_total", label: "Total Deduction (-)" },
    { key: "net_amount", label: "Net Amount" },
    { key: "records", label: "Records" },
    { key: "work", label: "Work" },
    { key: "deductions", label: "Deductions" },
    { key: "balance", label: "Balance" },
    { key: "staff", label: "Staff" },
  ],
});

export const sanitizeRuleData = (raw = {}, referenceData = {}) => {
  const attendanceRules = uniqueByKey(
    (Array.isArray(raw?.attendance_rules) && raw.attendance_rules.length
      ? raw.attendance_rules
      : defaultAttendanceRules(referenceData?.attendance_options)
    ).map((rule) => ({
      label: normalizeText(rule?.label),
      counts_record: rule?.counts_record !== false,
      counts_production: Boolean(rule?.counts_production),
      allows_bonus: Boolean(rule?.allows_bonus),
      pay_mode: Object.values(ATTENDANCE_PAY_MODES).includes(rule?.pay_mode)
        ? rule.pay_mode
        : ATTENDANCE_PAY_MODES.SALARY_DAY_OR_PRODUCTION,
      allowance_code: Object.values(ATTENDANCE_ALLOWANCE_CODES).includes(rule?.allowance_code)
        ? rule.allowance_code
        : ATTENDANCE_ALLOWANCE_CODES.NORMAL,
      upgrade_half_to_day: Boolean(rule?.upgrade_half_to_day),
    })),
    (rule) => rule?.label
  );

  const customerPaymentMethodRules = uniqueByKey(
    (Array.isArray(raw?.customer_payment_method_rules) && raw.customer_payment_method_rules.length
      ? raw.customer_payment_method_rules
      : defaultCustomerPaymentMethodRules(referenceData?.customer_payment_methods)
    ).map((rule) => ({
      method: normalizeText(rule?.method),
      requires_reference: Boolean(rule?.requires_reference),
      requires_bank: Boolean(rule?.requires_bank),
      requires_party: Boolean(rule?.requires_party),
      requires_issue_date: Boolean(rule?.requires_issue_date),
      allows_clear_date: Boolean(rule?.allows_clear_date),
    })),
    (rule) => rule?.method
  );

  const staffPaymentTypeRules = uniqueByKey(
    (Array.isArray(raw?.staff_payment_type_rules) && raw.staff_payment_type_rules.length
      ? raw.staff_payment_type_rules
      : defaultStaffPaymentTypeRules(referenceData?.staff_payment_types)
    ).map((rule) => ({
      type: normalizeText(rule?.type),
      history_effect: Object.values(PAYMENT_EFFECT_MODES).includes(rule?.history_effect)
        ? rule.history_effect
        : PAYMENT_EFFECT_MODES.SUBTRACT,
      current_effect: Object.values(PAYMENT_EFFECT_MODES).includes(rule?.current_effect)
        ? rule.current_effect
        : PAYMENT_EFFECT_MODES.SUBTRACT,
    })),
    (rule) => rule?.type
  );

  const expenseTypeRules = uniqueByKey(
    (Array.isArray(raw?.expense_type_rules) && raw.expense_type_rules.length
      ? raw.expense_type_rules
      : defaultExpenseTypeRules(referenceData?.expense_types)
    ).map((rule) => ({
      key: normalizeText(rule?.key || rule?.type),
      label: normalizeExpenseTypeLabel(rule?.key || rule?.type, rule?.label || rule?.key || rule?.type),
      is_fixed: Boolean(rule?.is_fixed),
      requires_supplier: Boolean(rule?.requires_supplier),
    })),
    (rule) => rule?.key
  );

  const accessRules = uniqueByKey(
    normalizeAccessRules(raw?.access_rules || [], referenceData?.user_roles || []).map((rule) => ({
      key: normalizeText(rule?.key),
      label: normalizeText(rule?.label || rule?.key),
      roles: Array.isArray(rule?.roles) ? rule.roles.map((role) => normalizeText(role)).filter(Boolean) : [],
      show_in_sidebar: rule?.show_in_sidebar !== false,
    })),
    (rule) => rule?.key
  );

  const allowanceRule = {
    min_records: Math.max(0, Number(raw?.allowance_rule?.min_records ?? defaultAllowanceRule().min_records) || 0),
    max_absent: Math.max(0, Number(raw?.allowance_rule?.max_absent ?? defaultAllowanceRule().max_absent) || 0),
    max_half: Math.max(0, Number(raw?.allowance_rule?.max_half ?? defaultAllowanceRule().max_half) || 0),
  };

  const displayPreferences = {
    salary_slip_fields: Array.isArray(raw?.display_preferences?.salary_slip_fields) && raw.display_preferences.salary_slip_fields.length
      ? raw.display_preferences.salary_slip_fields.map((item) => normalizeText(item)).filter(Boolean)
      : defaultDisplayPreferences().salary_slip_fields,
    dashboard_staff_columns: Array.isArray(raw?.display_preferences?.dashboard_staff_columns) && raw.display_preferences.dashboard_staff_columns.length
      ? raw.display_preferences.dashboard_staff_columns.map((item) => normalizeText(item)).filter(Boolean)
      : defaultDisplayPreferences().dashboard_staff_columns,
    label_overrides: uniqueByKey(
      (Array.isArray(raw?.display_preferences?.label_overrides) && raw.display_preferences.label_overrides.length
        ? raw.display_preferences.label_overrides
        : defaultDisplayPreferences().label_overrides
      ).map((entry) => ({
        key: normalizeText(entry?.key),
        label: normalizeText(entry?.label),
      })),
      (entry) => entry?.key
    ),
  };

  return {
    attendance_rules: attendanceRules,
    customer_payment_method_rules: customerPaymentMethodRules,
    staff_payment_type_rules: staffPaymentTypeRules,
    expense_type_rules: expenseTypeRules,
    access_rules: accessRules,
    allowance_rule: allowanceRule,
    display_preferences: displayPreferences,
  };
};

export const buildRuleContext = (referenceData = {}, ruleData = {}) => {
  const safeRuleData = sanitizeRuleData(ruleData, referenceData);
  return {
    reference_data: referenceData || {},
    rule_data: safeRuleData,
    attendance_rules_map: new Map(safeRuleData.attendance_rules.map((rule) => [rule.label, rule])),
    customer_payment_method_rules_map: new Map(
      safeRuleData.customer_payment_method_rules.map((rule) => [rule.method, rule])
    ),
    staff_payment_type_rules_map: new Map(
      safeRuleData.staff_payment_type_rules.map((rule) => [rule.type, rule])
    ),
    expense_type_rules_map: new Map(
      safeRuleData.expense_type_rules.map((rule) => [rule.key, rule])
    ),
  };
};

export const getAttendanceRule = (context, attendance) => {
  const label = normalizeText(attendance);
  return context?.attendance_rules_map?.get(label) || defaultAttendanceRules([label])[0];
};

export const getCustomerPaymentMethodRule = (context, method) => {
  const value = normalizeText(method);
  return context?.customer_payment_method_rules_map?.get(value) || defaultCustomerPaymentMethodRules([value])[0];
};

export const getStaffPaymentTypeRule = (context, type) => {
  const value = normalizeText(type);
  return context?.staff_payment_type_rules_map?.get(value) || defaultStaffPaymentTypeRules([value])[0];
};

export const getExpenseTypeRule = (context, key) => {
  const value = normalizeText(key);
  return context?.expense_type_rules_map?.get(value) || defaultExpenseTypeRules([value])[0];
};

export const isAllowanceEligibleFromAttendanceRules = (attendanceCounts = {}) => {
  const recordCount = Number(attendanceCounts?.record_count || 0);
  const absentCount = Number(attendanceCounts?.absent_count || 0);
  const halfCount = Number(attendanceCounts?.half_count || 0);
  return recordCount >= 26 && absentCount === 0 && halfCount <= 1;
};

export const applyPaymentEffect = (amount, effect, currentValue = 0) => {
  const safeAmount = Number(amount || 0);
  if (effect === PAYMENT_EFFECT_MODES.ADD) return currentValue + safeAmount;
  if (effect === PAYMENT_EFFECT_MODES.SUBTRACT) return currentValue - safeAmount;
  return currentValue;
};

export const getBusinessRuleContextByBusinessId = async (businessId) => {
  if (!businessId) {
    return buildRuleContext({}, {});
  }
  const business = await Business.findById(businessId).select("reference_data rule_data").lean();
  return buildRuleContext(business?.reference_data || {}, business?.rule_data || {});
};

export const getAllowanceRule = (context) => context?.rule_data?.allowance_rule || defaultAllowanceRule();

export const isAllowanceEligibleWithRule = (attendanceCounts = {}, context = null) => {
  const rule = getAllowanceRule(context);
  return Number(attendanceCounts?.record_count || 0) >= Number(rule?.min_records || 0)
    && Number(attendanceCounts?.absent_count || 0) <= Number(rule?.max_absent || 0)
    && Number(attendanceCounts?.half_count || 0) <= Number(rule?.max_half || 0);
};

export const roleHasBusinessAccess = (context = null, accessKey = "", role = "") =>
  hasAccessRuleForRole(context?.rule_data || {}, context?.reference_data || {}, accessKey, role);
