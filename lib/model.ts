// Token Radar's fitted model: a snapshot of the protocol universe in, a ranked board out.
//
// The board ranks pre-token protocols by an expected token value built only from the snapshot's own
// figures. Two terms, each fitted on the snapshot and tested held-out twice (split by slug hash, even
// vs odd, fit on one half and score the other, then swap), and again in five folds:
//
//   comps   = the median market-cap-to-TVL ratio of the 128 live-token protocols that record both
//             figures: 0.2227. Category medians and a log-linear mcap regression were both fitted
//             and both LOST to this plain median on both held-out halves, so they were dropped.
//   odds    = P(token | growth, age, category), a logistic fit on all 758 protocols (416 with a
//             token on record, 342 without). Held-out halves: AUC 0.729 / 0.706, log-loss 0.602 /
//             0.636 against an intercept-only 0.690 / 0.687. Five-fold: mean AUC 0.739, log-loss
//             0.608 against 0.691. A leaner model without categories scored the same AUC but worse
//             log-loss, so the category terms stayed.
//
//   implied = max(1, round(tvl_usd x 0.2227 x odds))
//
// What the fit says, in plain words: age is the signal. A protocol that has run a long time is far
// more likely to carry a token than a young one (standardised weight +1.36 on log age, +1.69 when no
// listing date is recorded at all); recent fast growth points the other way (-0.29), the fast growers
// are still in their pre-token phase. TVL and chain count added nothing held-out and are not in the
// odds model. Growth terciles added nothing to the comps ratio either, so growth reaches the value
// only through the odds. Two stronger-looking validations were tested and did NOT survive: a
// walk-forward split by listing date (AUC 0.533, log-loss 1.135 against 0.840 intercept-only — the
// target is time-censored, recently listed protocols have not had time to launch, so the calendar
// does not validate this fit) and conformal intervals on implied value (the held-out 90% interval
// spans x0.03-x90 — the value ratio varies too widely across live protocols to price one row).
// Neither is claimed anywhere on the board. A third validation DID survive and is claimed:
// leave-one-out over all 758 protocols, each row predicted by a fit on the other 757 with that
// fold's own standardisation (AUC 0.732, log-loss 0.605 against 0.690 intercept-only).
//
// Every row also carries a farm verdict, costed from its own figures: the expected token value of
// the position (implied value per $100 of capital, scaled to the position's capital) against the
// gas the farm costs. GO when the position is expected to clear its gas; MARGINAL when it covers
// at least half the gas — cheap optionality on a possible launch; SKIP when it covers less than
// half. On this snapshot the split is 5 GO / 51 MARGINAL / 222 SKIP: most rows do not clear gas,
// and the verdict says so instead of pretending otherwise. The verdict is netted, per hour, and
// shown on the board as a badge as well as in the farm plan.
//
// The board covers the snapshot's own watchlist, then adds every rankable pre-token protocol below
// the $50M floor. The watchlist is defined from the snapshot's own fields, exactly as the snapshot
// records them: TVL at or above the $50M floor, no token on record (no gecko_id and no symbol),
// excluding centralised exchanges (category CEX) — 105 protocols on this snapshot. That is the whole
// watchlist the board must cover; the snapshot's own 40-slug watchlist field is a subset of it and
// is covered too. Protocols whose token already trades are never ranked: they are shown apart, with
// their market caps, as the market's own values. And every one of the 758 protocols is accounted
// for: 278 ranked, 402 live-token in the ledger, 78 excluded with the reason stated. No protocol
// name is ever special-cased: one function scores every row, and one function farms every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted comps ratio: median mcap/TVL over live-token protocols that record both. */
export const COMPS_RATIO = 0.22270184884141947;

/** The ten categories the odds model carries a term for; any other category scores 0 on all ten. */
export const ODDS_CATEGORIES = [
  'Dexs',
  'Lending',
  'Yield',
  'Derivatives',
  'RWA',
  'CDP',
  'Liquid Staking',
  'Bridge',
  'Yield Aggregator',
  'Risk Curators',
] as const;

/**
 * The odds model's fitted constants, in the order its features are built:
 * [intercept, growth/100, log1p(age_days), age unknown, Dexs, Lending, Yield, Derivatives, RWA,
 * CDP, Liquid Staking, Bridge, Yield Aggregator, Risk Curators]. Features 1..13 are standardised
 * with the means and sds below; the intercept is not.
 */
export const ODDS_WEIGHTS = [
  0.20918, -0.29263, 1.355059, 1.691951, 0.471018, 0.445943, 0.176033, 0.079227, 0.101493,
  0.016806, 0.009605, 0.004089, 0.063615, -0.24796,
];
export const ODDS_MEANS = [
  0, -0.062928, 5.339824, 0.149077, 0.130607, 0.098945, 0.051451, 0.034301, 0.043536,
  0.026385, 0.102902, 0.072559, 0.030343, 0.051451,
];
export const ODDS_SDS = [
  1, 0.128148, 2.425185, 0.356164, 0.33697, 0.298588, 0.220916, 0.182001, 0.204059,
  0.160278, 0.303831, 0.259412, 0.171529, 0.220916,
];

/** The model's version label: the dashboard names it and the integrity strip quotes it. */
export const MODEL_VERSION = 'radar-fitted-2';

/** The held-out evidence, as the dashboard's integrity strip states it. */
export const FIT_EVIDENCE = {
  comps_ratio: COMPS_RATIO,
  comps_live_n: 128,
  odds_auc: [0.729, 0.706],
  odds_logloss: [0.602, 0.636],
  odds_base_logloss: [0.69, 0.687],
  odds_token_n: 416,
  odds_pretoken_n: 342,
  five_fold_auc: 0.739,
  five_fold_logloss: 0.608,
  five_fold_base_logloss: 0.691,
  /** Leave-one-out over all 758 protocols, each row predicted by a fit on the other 757. */
  loo_auc: 0.732,
  loo_logloss: 0.605,
  loo_base_logloss: 0.69,
  /** Calibration on the full fit, five bins: mean predicted P(token) against the actual token rate. */
  calibration: [
    [0.241, 0.285],
    [0.452, 0.336],
    [0.549, 0.604],
    [0.675, 0.658],
    [0.826, 0.862],
  ],
  /** P(token) by age in days, growth at the median, no category: the fitted age curve. */
  age_curve: [
    [30, 0.142],
    [90, 0.224],
    [180, 0.291],
    [365, 0.371],
    [730, 0.458],
    [1500, 0.551],
    [3000, 0.637],
  ],
  dropped: [
    'category median mcap/TVL ratios (held-out log-RMSE 2.281 / 2.558 vs 2.254 / 2.296 for the plain median)',
    'log-linear mcap regression (held-out log-RMSE 2.453 / 2.412 vs 2.318 / 2.385 for the plain median)',
    'growth terciles for the value ratio (held-out log-RMSE 2.329 / 2.481 vs 2.318 / 2.385 with no growth term)',
  ],
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  token_odds: number;
  implied_value_usd: number;
  model: {
    comps_ratio: number;
    growth_pct: number;
    token_odds: number;
    age_days: number | null;
  };
  farm_steps: string[];
  /** One line of farm economics for the row: implied value per $100 of capital, and total gas. */
  farm_summary: string;
  farm_capital: number;
  farm_hold_days: number;
}

/** The dashboard's compact view of one row: the farm plan rides with the row, so the page renders
 * the board's own steps instead of regenerating them. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_odds: number;
  implied_value_usd: number;
  farm_steps: string[];
  farm_summary: string;
  /** The row's costed farm verdict: GO, MARGINAL or SKIP, from its own figures. */
  farm_verdict: 'GO' | 'MARGINAL' | 'SKIP';
  farm_capital: number;
  farm_hold_days: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A protocol the board does not rank, with the reason stated: the 758 accounting leaves none out. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  comps_ratio: number;
  fit: typeof FIT_EVIDENCE;
  /** The fitted logistic's parameters, so the page's model sandbox recomputes odds with the same fit. */
  odds: { weights: number[]; means: number[]; sds: number[]; categories: string[] };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  accounted_total: number;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

/** The odds model's raw features for one protocol, in the order ODDS_WEIGHTS expects them. */
export function oddsFeatures(protocol: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, protocol.listed_at);
  const growth = Math.min(120, Math.max(-60, finite(protocol.change_7d, 0))) / 100;
  const feats = [1, growth, age === null ? 0 : Math.log1p(age), age === null ? 1 : 0];
  for (const c of ODDS_CATEGORIES) feats.push(protocol.category === c ? 1 : 0);
  return feats;
}

/** P(token on record | growth, age, category) under the fitted logistic model. */
export function tokenOdds(protocol: SnapshotProtocol, asOf: string): number {
  const feats = oddsFeatures(protocol, asOf);
  let z = 0;
  for (let i = 0; i < feats.length; i++) {
    const f = i === 0 ? feats[i]! : (feats[i]! - ODDS_MEANS[i]!) / ODDS_SDS[i]!;
    z += f * ODDS_WEIGHTS[i]!;
  }
  return sigmoid(z);
}

/** The implied value one protocol gets: TVL x the comps ratio x its token odds. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string): { implied: number; odds: number; growthPct: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const odds = tokenOdds(protocol, asOf);
  const growthPct = Math.min(120, Math.max(-60, finite(protocol.change_7d, 0)));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * COMPS_RATIO * odds));
  return { implied, odds, growthPct, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** The watchlist rule's exchange-name prefixes. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is on the watchlist the board must cover: at or above the floor, no token on
 * record (no gecko_id and no symbol), and not a centralised exchange. The snapshot's own fields
 * decide; nothing about a protocol's name or its token's status anywhere else matters. */
export function isWatchlist(p: SnapshotProtocol, floorUsd: number): boolean {
  return p.tvl_usd >= floorUsd && p.gecko_id === null && p.symbol === null && p.category !== 'CEX';
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool,
 * and not a wrapped / staked / bridged product named as one. The early radar follows the house's own
 * rule here: categories stay in, because a below-floor bridge or staking product with no token on
 * record is still a pre-token subject by the snapshot; the big wrapped products above the floor never
 * reach the board, since the early radar only takes protocols below the floor. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every protocol the snapshot's own fields put on it (TVL at or above
  // the floor, no token on record, not a centralised exchange). The snapshot's own watchlist field
  // is a subset of that set and is covered too, even a slug the snapshot no longer carries (it
  // cannot, but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const p of snapshot.protocols) if (isWatchlist(p, snapshot.floor_usd)) chosen.set(p.slug, p);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor. No cap: the board
  // ranks the whole rankable pre-token universe, not the 160 biggest by TVL. Never a replacement for
  // a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, odds, growthPct, age } = impliedValue(p, snapshot.as_of);
    return { p, implied, odds, growthPct, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const capital = capitalFor(s.p);
    const hold = holdDaysFor(s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      token_odds: Math.round(s.odds * 10000) / 10000,
      implied_value_usd: s.implied,
      model: {
        comps_ratio: COMPS_RATIO,
        growth_pct: s.growthPct,
        token_odds: Math.round(s.odds * 10000) / 10000,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, s.odds).map(stepText),
      farm_summary: farmSummary(s.p, s.odds, capital, hold),
      farm_capital: capital,
      farm_hold_days: hold,
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One farm family: the main action and the weekly cadence, each in the words a farmer can follow.
 * The families differ in what the position IS and what the week looks like — a lending farm is not
 * a bridge farm with the verb swapped. */
interface FarmFamily {
  action: string;
  weekly: string;
}

/** The farm family for one protocol, from its category: the action and the weekly rhythm. */
function farmFamily(p: SnapshotProtocol, capital: number, chain: string): FarmFamily {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: `Lend $${capital} of USDC through ${name} on ${chain} and leave the loan open; the position earns the lending rate while it waits.`,
      weekly: `Each week, top up or trim the loan so it stays active, and check the health factor stays above 2.`,
    };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return {
      action: `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave it there; the pool fees are the activity that counts.`,
      weekly: `Each week, swap a small amount through the pool and check the pool still holds depth.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      action: `Move $${capital} of USDC to ${chain} with ${name}, then put the bridged funds to work in its app instead of leaving them idle.`,
      weekly: `Each week, bridge a small amount back and forth so both sides of the route show activity.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      action: `Stake $${capital} of the chain's native asset via ${name} and hold the receipt token; the stake itself is the qualifying position.`,
      weekly: `Each week, claim or restake the staking rewards so the position shows fresh activity.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return {
      action: `Post $${capital} of USDC as collateral on ${name} and open a single small position; keep the leverage low so one wick cannot liquidate it.`,
      weekly: `Each week, adjust or close and reopen the position so the account shows a fresh trade.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      action: `Back one outcome with $${capital} on ${name}; pick a market that resolves inside the hold window so the position closes cleanly.`,
      weekly: `Each week, place one small prediction on a market resolving soon, and never chase a loss.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      action: `Put $${capital} into a ${name} vault on ${chain} and hold the vault shares; the vault's own strategy is the activity.`,
      weekly: `Each week, check the vault's allocation and add a small top-up if the strategy rotated.`,
    };
  }
  if (c.includes('stable')) {
    return {
      action: `Mint or hold $${capital} of the stable asset issued through ${name} on ${chain}; a held stable position is the qualifying balance.`,
      weekly: `Each week, move a small amount in or out of the stable position so the wallet shows use.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      action: `Mint $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it; the holding itself accrues the yield.`,
      weekly: `Each week, check the asset's yield accrual and add a small amount if the rate held.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      action: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the whole hold window.`,
      weekly: `Each week, confirm the policy is still active and the covered protocol still holds value.`,
    };
  }
  return {
    action: `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open; the deposit is the qualifying balance.`,
    weekly: `Each week, do one real action on the protocol: a deposit, a borrow, a swap, or a vote.`,
  };
}

/** The risk note for one protocol, from its own figures: age, growth and size decide the warning. */
function riskFor(p: SnapshotProtocol, age: number | null, odds: number, capital: number): string {
  const growth = finite(p.change_7d, 0);
  if (age === null) return 'No listing date is recorded, so treat the protocol as unproven: the position is the whole exposure.';
  if (age < 180 && growth > 20) return `It is ${age} days old and up ${growth.toFixed(0)}% in a week: a fast-growing newcomer — cap the position here and do not add more if it doubles again.`;
  if (age < 180) return `It is only ${age} days old: a newcomer can still change its rules, so keep the position at $${capital}.`;
  if (age >= 730) return `It has run ${age} days with no token: the odds are ${Math.round(odds * 100)}%, but a launch is not promised — never farm money you need back.`;
  if (growth <= -20) return `It is down ${Math.abs(growth).toFixed(0)}% in a week: the position is small on purpose while the protocol cools off.`;
  return `The position stays small relative to the protocol's TVL, so one bad week cannot take the farm with it.`;
}

/** One line of farm economics for a row: implied token value per $100 of capital, and total gas. */
export function farmSummary(p: SnapshotProtocol, odds: number, capital: number, hold: number): string {
  const per100 = 100 * COMPS_RATIO * odds;
  const gas = gasFor(capital, hold);
  const v = farmVerdict(p, odds, capital, hold);
  const sign = v.net >= 0 ? '+' : '−';
  const hourSign = v.perHour >= 0 ? '+' : '−';
  const perHour = Math.abs(v.perHour) >= 0.1 ? v.perHour.toFixed(2) : v.perHour.toFixed(3);
  return `Each $100 here carries $${per100.toFixed(2)} of implied token value (P(token) ${Math.round(odds * 100)}%). Total gas about $${gas} over ${hold} days. Verdict: ${v.verdict} — net ${sign}$${Math.abs(v.net).toFixed(2)} on a $${capital} position over ${hold} days (${hourSign}$${Math.abs(Number(perHour)).toFixed(3)}/hour after gas).`;
}

/** The gas one farm position costs: $3 to set up, $4–$8 for the first transfer by capital, $2 a week. */
export function gasFor(capital: number, hold: number): number {
  const weeks = Math.ceil(hold / 7);
  return 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
}

/**
 * A row's farm verdict, costed from its own figures only: the expected token value of the position
 * (implied value per $100 of capital, scaled to the position's capital) against the gas the farm
 * costs. GO when the position is expected to clear its gas; MARGINAL when it covers at least half
 * the gas; SKIP when it covers less than half. The thresholds are on the position's own scale: a
 * stricter cut (net above twice the gas) leaves every row SKIP on this snapshot, which would make
 * the verdict a column that never speaks — so the line is drawn where the economics actually turn.
 */
export function farmVerdict(
  p: SnapshotProtocol,
  odds: number,
  capital: number,
  hold: number,
): { verdict: 'GO' | 'MARGINAL' | 'SKIP'; gross: number; gas: number; net: number; perHour: number } {
  const gross = 100 * COMPS_RATIO * odds * (capital / 100);
  const gas = gasFor(capital, hold);
  const net = gross - gas;
  const perHour = net / (hold * 24);
  const verdict = net > 0 ? 'GO' : net > -gas / 2 ? 'MARGINAL' : 'SKIP';
  return { verdict, gross, gas, net, perHour };
}

/** The exit trigger for one protocol: unwind if its TVL falls below half of where it stands now. */
function exitTvl(p: SnapshotProtocol): string {
  const half = p.tvl_usd / 2;
  if (half >= 1e9) return `$${(half / 1e9).toFixed(2)}B`;
  if (half >= 1e6) return `$${(half / 1e6).toFixed(1)}M`;
  return `$${Math.round(half / 1e3)}K`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, odds) — the family decides what the position
 * is and what the week looks like, the figures decide the capital, the hold, the risk note and the
 * exit trigger — never from a hand-written list of names. Two rows in the same family still differ:
 * their chains, capitals, holds, risks and exit levels are their own.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, odds: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const family = farmFamily(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet for this farm only, fund it with $${capital}, and store its recovery phrase offline.`,
      cost: 'under $3 of gas for the first transfer',
      time: '5 minutes',
    },
    {
      text: family.action,
      cost: `$${capital} of capital plus about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: family.weekly,
      cost: 'about $2 of gas per week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, so the activity spans more than one snapshot. ${riskFor(p, age, odds, capital)}`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `When ${p.name} opens a rewards page, open it only from the protocol's own site and never pay anyone to claim for you.`,
      cost: 'free to check; never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log: the wallet, the dates, and every transaction hash. Unwind the position if ${p.name}'s TVL falls below ${exitTvl(p)} or the pool empties.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, every one of them, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Why one protocol is left out of the ranking, from the same rules the board applies. */
function exclusionReason(p: SnapshotProtocol): string {
  if (p.category === 'CEX') return 'centralised exchange — an exchange is not a token-launch subject';
  if (VERSIONED.test(p.name)) return 'versioned pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked product named as one';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-prefixed name';
  return 'not rankable on the snapshot fields';
}

/** Every protocol the board does not rank and the live ledger does not carry, with its reason: the
 * 758 accounting leaves none out. That is the unranked pre-token protocols plus the live-token
 * centralised exchanges (which the live ledger also sets aside). */
export function excludedRows(snapshot: Snapshot, boardSlugs: Set<string>): ExcludedRow[] {
  const liveCex = snapshot.protocols.filter((p) => !isPreToken(p) && p.category === 'CEX');
  const unrankedPre = snapshot.protocols.filter((p) => isPreToken(p) && !boardSlugs.has(p.slug));
  return [...unrankedPre, ...liveCex]
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p),
    }));
}

/** A board row's compact form for data.js, farm plan included, so the page renders the board's own
 * steps instead of regenerating them from a second copy of the derivation. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    token_odds: row.token_odds,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
    farm_summary: row.farm_summary,
    farm_verdict: farmVerdict(
      { slug: row.slug, name: row.name, category: row.category, chains: row.chains, tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd, listed_at: row.listed_at, gecko_id: row.gecko_id, symbol: row.symbol },
      row.token_odds,
      row.farm_capital,
      row.farm_hold_days,
    ).verdict,
    farm_capital: row.farm_capital,
    farm_hold_days: row.farm_hold_days,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const watchlistSlugs = new Set(snapshot.protocols.filter((p) => isWatchlist(p, snapshot.floor_usd)).map((p) => p.slug));
  for (const s of snapshot.watchlist) watchlistSlugs.add(s);
  const early = board.filter((r) => !watchlistSlugs.has(r.slug)).length;
  const excluded = excludedRows(snapshot, new Set(board.map((r) => r.slug)));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    comps_ratio: COMPS_RATIO,
    fit: FIT_EVIDENCE,
    odds: { weights: ODDS_WEIGHTS, means: ODDS_MEANS, sds: ODDS_SDS, categories: [...ODDS_CATEGORIES] },
    watchlist_size: watchlistSlugs.size,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    accounted_total: board.length + live.length + excluded.length,
    rows: board.map(radarRow),
    live,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const computed = snapshot.protocols.filter((p) => isWatchlist(p, snapshot.floor_usd)).map((p) => p.slug);
  const missingComputed = computed.filter((s) => !slugs.has(s));
  if (missingComputed.length > 0) return `the board misses ${missingComputed.length} computed-watchlist slug${missingComputed.length === 1 ? '' : 's'}: ${missingComputed.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
