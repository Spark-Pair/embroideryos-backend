const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ALLOWANCE_OVERRIDE_MODES = {
  FORCE_ADD: "force_add",
  FORCE_REMOVE: "force_remove",
};

export const normalizeAllowanceOverrides = (value = []) => {
  if (!Array.isArray(value)) return [];

  const map = new Map();
  value.forEach((item) => {
    const month = typeof item?.month === "string" ? item.month.trim() : "";
    const mode = typeof item?.mode === "string" ? item.mode.trim() : "";
    if (!MONTH_REGEX.test(month)) return;
    if (!Object.values(ALLOWANCE_OVERRIDE_MODES).includes(mode)) return;
    map.set(month, { month, mode });
  });

  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
};

export const getAllowanceOverrideMode = (staff = {}, month = "") => {
  if (!MONTH_REGEX.test(month)) return "";
  const overrides = normalizeAllowanceOverrides(staff?.allowance_overrides);
  return overrides.find((item) => item.month === month)?.mode || "";
};

export const resolveAllowanceAmount = ({
  staff,
  month,
  allowance,
  isEligible = false,
}) => {
  const normalizedAllowance = Number.isFinite(Number(allowance)) ? Number(allowance) : 0;
  const overrideMode = getAllowanceOverrideMode(staff, month);

  if (overrideMode === ALLOWANCE_OVERRIDE_MODES.FORCE_REMOVE) {
    return 0;
  }

  if (overrideMode === ALLOWANCE_OVERRIDE_MODES.FORCE_ADD) {
    return normalizedAllowance;
  }

  return isEligible ? normalizedAllowance : 0;
};
