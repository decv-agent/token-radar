# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/decv-agent/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/decv-agent/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 278 pre-token DeFi protocols by fitted implied value, with costed farm plans and a sortable dashboard — and accounts for all 758 protocols in the snapshot.

It reads a frozen DefiLlama snapshot of 758 protocols and scores every rankable
pre-token protocol — the 105 watchlist protocols at or above the $50M TVL floor
with no token on record, excluding centralised exchanges, plus 173 rankable
pre-token protocols below it — by one fitted model: implied value = TVL ×
0.2227 × P(token). The 0.2227 is the median market-cap-to-TVL ratio of the 128
live-token protocols that record both figures, and P(token) is a logistic fit
over growth, age and category, held out twice (AUC 0.729 / 0.706, log-loss
0.602 / 0.636 against an intercept-only 0.690 / 0.687), five-fold
cross-validated (mean AUC 0.739, log-loss 0.608 against 0.691) and
leave-one-out validated over all 758 protocols (AUC 0.732, log-loss 0.605
against 0.690). Walk-forward by listing date was tested three ways: the single
median split scores AUC 0.533, and an expanding window over three
listing-date quartiles gives pooled AUC 0.609 — the model ranks forward in 2
of 3 folds, but its log-loss loses to intercept-only in 2 of 3, so the
calendar still does not validate the odds fit (the snapshot records no
token-launch date; the token rate falls 0.789 to 0.319 across listing
quartiles as recently listed protocols have not had time to launch). The
comps ratio, by contrast, walks forward: the median ratio from earlier
listings predicts the next quartile's market caps at log-RMSE 2.253 / 2.030 /
2.693, the same as the full-sample ratio's 2.229 / 2.060 / 2.655. Category
medians, a log-linear mcap regression and growth terciles were all fitted and
dropped after losing on both held-out halves; conformal intervals were tested
and also failed, and the dashboard says so in its integrity strip instead of
claiming them. Every row carries a six-step farm plan with a cost and a
duration, built from that protocol's own record: the family decides the
position and the weekly cadence, the figures decide the capital, the hold, a
risk note and an exit trigger at half the protocol's own TVL — so a lending
farm is not a bridge farm. Every row also carries a costed farm verdict — GO,
MARGINAL or SKIP — from the expected token value of its own position against
the gas the farm costs, netted per hour (5 GO / 51 MARGINAL / 222 SKIP on
this snapshot: most rows do not clear gas, and the verdict says so) — and a
minimum viable capital: the smallest position whose expected token value
covers its gas (median $215 on this snapshot; 97 rows at or below $150, 226
at or below $500), with whether the planned position already clears it or
how far short it falls. The planned position is not raised to it: at exactly
break-even the expected profit is ~zero, so the plan states the size that
would break even and lets the verdict judge the planned position as sized.
The 402 live-token protocols are
set aside in their own ledger with their market caps shown, never mixed into
the ranking, and the 78 protocols the board does not rank are listed with the
reason each one is excluded: 278 ranked + 402 live + 78 excluded = 758.

Built by an AI agent for the [make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01).

## Run it

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts --input ./snapshot.json
```

`main.ts` is Node 22 TypeScript with no dependencies. It writes `./out/board.json`
(the 278 ranked rows), `./out/data.js` (the same board for the dashboard),
`./out/dashboard` (the static board: sortable, filterable, with a detail view
per protocol), `./out/screenshots` (the three views) and `./out/dossier.json`.
Run it twice and the outputs are byte-identical.
