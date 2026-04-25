export const PAYOUT_MODES = {
  TARGET_DUAL_PCT: "target_dual_pct",
  SINGLE_PCT: "single_pct",
  SALARY_BONUS_ONLY: "salary_bonus_only",
  STITCH_BLOCK_RATE: "stitch_block_rate",
};

export const DEFAULT_PAYOUT_MODE = PAYOUT_MODES.TARGET_DUAL_PCT;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeProductionConfig = (config = {}) => {
  const payoutMode = config?.payout_mode || DEFAULT_PAYOUT_MODE;
  return {
    ...config,
    payout_mode: payoutMode,
    stitch_rate: toNumber(config?.stitch_rate, 0),
    applique_rate: toNumber(config?.applique_rate, 0),
    on_target_pct: toNumber(config?.on_target_pct, 0),
    after_target_pct: toNumber(config?.after_target_pct, 0),
    production_pct: toNumber(config?.production_pct, 0),
    stitch_block_size: toNumber(config?.stitch_block_size, 0),
    amount_per_block: toNumber(config?.amount_per_block, 0),
    pcs_per_round: toNumber(config?.pcs_per_round, 0),
    target_amount: toNumber(config?.target_amount, 0),
    off_amount: toNumber(config?.off_amount, 0),
    bonus_rate: toNumber(config?.bonus_rate, 0),
    allowance: toNumber(config?.allowance, 0),
    stitch_cap: toNumber(config?.stitch_cap, 0),
  };
};

export const isTargetMode = (config = {}) =>
  normalizeProductionConfig(config).payout_mode === PAYOUT_MODES.TARGET_DUAL_PCT;

export const shouldShowProductionAmount = (config = {}) =>
  normalizeProductionConfig(config).payout_mode !== PAYOUT_MODES.SALARY_BONUS_ONLY;

export const calculateProductionRow = (row = {}, rawConfig = {}) => {
  const config = normalizeProductionConfig(rawConfig);
  const stitchRaw = toNumber(row?.d_stitch, 0);
  const pcs = toNumber(row?.pcs, 0);
  const rounds = toNumber(row?.rounds, 0);
  const applique = toNumber(row?.applique, 0);
  const stitchCap = toNumber(config?.stitch_cap, 0);
  const effectiveStitch = stitchRaw > 0 && stitchRaw <= stitchCap ? stitchCap : stitchRaw;

  const total_stitch = stitchRaw * rounds;
  const stitch_base = (effectiveStitch * config.stitch_rate * pcs) / 100;
  const applique_base = (config.applique_rate * applique * pcs) / 100;
  const combined = stitch_base + applique_base;

  if (config.payout_mode === PAYOUT_MODES.SALARY_BONUS_ONLY) {
    return { total_stitch, on_target_amt: 0, after_target_amt: 0 };
  }

  if (config.payout_mode === PAYOUT_MODES.SINGLE_PCT) {
    const amount = combined * config.production_pct;
    return { total_stitch, on_target_amt: amount, after_target_amt: amount };
  }

  if (config.payout_mode === PAYOUT_MODES.STITCH_BLOCK_RATE) {
    const blockSize = config.stitch_block_size;
    const amount = blockSize > 0
      ? (total_stitch / blockSize) * config.amount_per_block
      : 0;
    return { total_stitch, on_target_amt: amount, after_target_amt: amount };
  }

  return {
    total_stitch,
    on_target_amt: combined * config.on_target_pct,
    after_target_amt: combined * config.after_target_pct,
  };
};

export const calculateProductionTotals = (rows = [], config = {}) =>
  rows.reduce(
    (acc, row) => {
      const next = calculateProductionRow(row, config);
      return {
        pcs: acc.pcs + toNumber(row?.pcs, 0),
        rounds: acc.rounds + toNumber(row?.rounds, 0),
        total_stitch: acc.total_stitch + next.total_stitch,
        on_target_amt: acc.on_target_amt + next.on_target_amt,
        after_target_amt: acc.after_target_amt + next.after_target_amt,
      };
    },
    { pcs: 0, rounds: 0, total_stitch: 0, on_target_amt: 0, after_target_amt: 0 }
  );

export const getTargetProgress = (totals, rawConfig = {}, flags = {}) => {
  const config = normalizeProductionConfig(rawConfig);
  const targetMode = isTargetMode(config);
  const onTargetAmount = toNumber(totals?.on_target_amt, 0);
  const targetAmount = toNumber(config?.target_amount, 0);
  const targetMet = targetMode && targetAmount > 0 ? onTargetAmount >= targetAmount : false;
  const forceAfter = targetMode && Boolean(flags?.force_after_target_for_non_target);
  const forceFull = targetMode && Boolean(flags?.force_full_target_for_non_target);

  return {
    targetMode,
    targetMet,
    forceAfter,
    forceFull,
    effectiveAmount:
      forceFull
        ? (config.on_target_pct > 0 ? (targetAmount / config.on_target_pct) * config.after_target_pct : targetAmount)
        : (targetMet || forceAfter)
        ? toNumber(totals?.after_target_amt, 0)
        : toNumber(totals?.on_target_amt, 0),
  };
};
