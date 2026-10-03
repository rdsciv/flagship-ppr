# Flagship PPR

1QB, 12-team, full-PPR dynasty ranks next to the three rookie flagships most players are actually bought as:

- Prizm Silver
- Donruss Optic Holo Rated Rookie
- Contenders Optic silver autograph

Each comp shows raw, PSA 9, and PSA 10 guide prices, the PSA gem rate when a population is on file, and expected grading profit.

## Profit

Only PSA 9s and 10s are modeled, the same simplification as a clean-submission profit planner.

```
net = price × (1 − sell fee)
expected sale = gem rate × net PSA 10 + (1 − gem rate) × net PSA 9
expected profit = expected sale − raw price − grading cost
```

Defaults are a 13.25% sell fee and $29 all-in grading. Both are editable on the page. A gem rate with a population count is PSA 10s divided by that card's PSA population (GemRate). A number tagged **prior** is a planner stand-in, not that card's pop, and you can drag it.

## Daily update

`.github/workflows/daily.yml` runs at 13:15 UTC every day. It refetches FantasyCalc and rebuilds `data/board.json`, then GitHub Pages republishes. Card prices live in `data/card-book.json` and stay put until that file is updated. If FantasyCalc is down, the last board is left alone.

Add a card by appending an object to `data/card-book.json` (`player`, `product`, `raw`, `psa9`, `psa10`, and optional `gemRate` / `gems` / `pop`) and pushing. `product` is `prizm-silver`, `optic-holo`, or `contenders-silver-auto`.

Pages is the site. After this repo exists, turn it on once:

**Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)` → Save.**

The address is `https://rdsciv.github.io/flagship-ppr/`. Every push to `main`, including the morning rank refresh, republishes it.

Ranks are trade-derived values from FantasyCalc. Prices are SportsCardsPro sold guides. This is not a live bid and not advice.
