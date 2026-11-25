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
0.602 / 0.636 against an intercept-only 0.690 / 0.687) and five-fold
cross-validated (mean AUC 0.739, log-loss 0.608 against 0.691). Category
medians, a log-linear mcap regression and growth terciles were all fitted and
dropped after losing on both held-out halves; a walk-forward split and conformal
intervals were tested and also failed, and the dashboard says so in its
integrity strip instead of claiming them. Every row carries a six-step farm
plan with a cost and a duration, built from that protocol's own record: the
family decides the position and the weekly cadence, the figures decide the
capital, the hold, a risk note and an exit trigger at half the protocol's own
TVL — so a lending farm is not a bridge farm. The 402 live-token protocols are
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
