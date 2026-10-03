const PRODUCTS = ["prizm-silver", "optic-holo", "contenders-silver-auto"];
const state = {
  board: null,
  assumptions: { gradingCost: 29, sellFee: 0.1325, goal: 1000 },
  query: "",
  pos: "ALL",
  klass: "all",
  sort: "rank",
  onlyComps: false,
  onlyPop: false,
  selected: null,
  focus: "prizm-silver",
  overrides: {},
};

const money = (n, digits = 0) => {
  const body = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return n < 0 ? `−${body}` : body;
};
const signed = (n) => (n > 0 ? `+${money(n)}` : money(n));
const pct = (n) => `${Math.round(n * 100)}%`;
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clamp = (n) => Math.min(1, Math.max(0, n));

function dealFor(comp, prior, override) {
  const gemIsPrior = override == null && comp.gemRate == null;
  const gem = clamp(override ?? comp.gemRate ?? prior);
  const keep = 1 - clamp(state.assumptions.sellFee);
  const net10 = comp.psa10 * keep;
  const net9 = comp.psa9 * keep;
  const ev = gem * net10 + (1 - gem) * net9;
  const cost = comp.raw + Math.max(0, state.assumptions.gradingCost);
  const profit = ev - cost;
  const spread = net10 - net9;
  return {
    gem,
    gemIsPrior,
    profit,
    roi: cost > 0 ? profit / cost : 0,
    upside: net10 - cost,
    downside: net9 - cost,
    cost,
    breakeven: spread > 0 ? (cost - net9) / spread : null,
  };
}

function statusCopy(status) {
  if (status === "unreleased") return "Not released";
  if (status === "missing") return "No comp yet";
  if (status === "out-of-book") return "Class not in book";
  return "—";
}

function overrideOf(name, product) {
  const key = `${name}:${product}`;
  return Object.prototype.hasOwnProperty.call(state.overrides, key) ? state.overrides[key] : null;
}

function bestOf(player) {
  let lead = null;
  for (const slot of player.cards) {
    if (!slot.comp) continue;
    const deal = dealFor(slot.comp, state.board.priors[slot.product], overrideOf(player.name, slot.product));
    if (!lead || deal.profit > lead.deal.profit) lead = { slot, deal };
  }
  return lead;
}

function breakLabel(b) {
  if (b == null || !Number.isFinite(b)) return "No spread";
  if (b <= 0) return "A 9 already clears";
  if (b > 1) return "Even a 10 loses";
  return `${Math.round(b * 100)}% gems to break even`;
}

function planFor(deal) {
  if (deal.profit <= 0) return null;
  const cardsPerMonth = state.assumptions.goal / deal.profit;
  return {
    cardsPerMonth,
    cardsPerWeek: cardsPerMonth / 4.345,
    capital: cardsPerMonth * deal.cost * 3,
  };
}

function visiblePlayers() {
  const q = state.query.trim().toLowerCase();
  const rows = state.board.players.filter((player) => {
    if (state.pos !== "ALL" && player.pos !== state.pos) return false;
    if (["2026", "2025", "2024", "2023"].includes(state.klass) && String(player.draftYear) !== state.klass) return false;
    if (state.klass === "earlier" && (player.draftYear == null || player.draftYear >= 2023)) return false;
    if (state.onlyComps && !player.cards.some((c) => c.comp)) return false;
    if (state.onlyPop && !player.cards.some((c) => c.comp && c.comp.gemRate != null)) return false;
    if (q && !`${player.name} ${player.team} ${player.pos}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    if (state.sort === "profit") return (bestOf(b)?.deal.profit ?? -1e12) - (bestOf(a)?.deal.profit ?? -1e12);
    if (state.sort === "roi") return (bestOf(b)?.deal.roi ?? -1e12) - (bestOf(a)?.deal.roi ?? -1e12);
    if (state.sort === "trend") return b.trend30 - a.trend30;
    if (state.sort === "gem") return (bestOf(b)?.deal.gem ?? -1) - (bestOf(a)?.deal.gem ?? -1);
    return a.rank - b.rank;
  });
  return rows;
}

function popLeaders() {
  const hits = [];
  for (const player of state.board.players) {
    for (const slot of player.cards) {
      if (!slot.comp || slot.comp.gemRate == null) continue;
      hits.push({
        player,
        slot,
        deal: dealFor(slot.comp, state.board.priors[slot.product], overrideOf(player.name, slot.product)),
      });
    }
  }
  hits.sort((a, b) => b.deal.profit - a.deal.profit);
  return hits;
}

function el(html) {
  const node = document.createElement("template");
  node.innerHTML = html.trim();
  return node.content.firstChild;
}

function render() {
  document.querySelectorAll(".sheet, .mask").forEach((node) => node.remove());
  const app = document.getElementById("app");
  const board = state.board;
  const leader = popLeaders()[0];
  const plan = leader ? planFor(leader.deal) : null;
  const rows = visiblePlayers();
  app.innerHTML = "";
  app.append(
    el(`<header class="head">
      <div>
        <p class="kicker">Dynasty desk</p>
        <h1>Flagship PPR</h1>
        <p class="lede">Weekly 1QB full-PPR dynasty board, lined up with Prizm Silver, Optic Holo, and Contenders Optic silver autos. Gem rate, raw, PSA 9, PSA 10, and the profit if you buy raw and grade.</p>
      </div>
      <p class="muted nums">Ranks ${board.rankingsAsOf} / Comps ${board.pricesAsOf}</p>
    </header>`),
  );

  const assumptions = el(`<div class="assumptions"></div>`);
  assumptions.append(
    field("Grading, all-in", "gradingCost", "$", "", 0, 250, 1),
    field("Sell fee", "sellFeePct", "", "%", 0, 40, 0.1),
    field("Monthly profit goal", "goal", "$", "", 0, 100000, 50),
  );
  app.append(assumptions);

  if (leader) {
    const kpis = el(`<section class="kpis"></section>`);
    kpis.append(
      kpi(
        "Best pop-backed flip",
        `${leader.player.name} · ${leader.slot.label}`,
        signed(leader.deal.profit),
        `${pct(leader.deal.gem)} PSA gem · ${leader.slot.comp.gems.toLocaleString()} of ${leader.slot.comp.pop.toLocaleString()}`,
        leader.deal.profit >= 0 ? "profit" : "loss",
      ),
      kpi(
        "Cards to clear the month",
        `${money(state.assumptions.goal)} goal`,
        plan ? plan.cardsPerMonth.toFixed(1) : "Not at this EV",
        plan
          ? `${plan.cardsPerWeek.toFixed(1)} a week · ${money(plan.capital)} tied up for 3 months`
          : "Expected profit is not positive",
      ),
      kpi("Book", board.format, String(rows.length), "Showing on this cut. Priors are labeled and left out of the headline flip."),
    );
    app.append(kpis);
  }

  const toolbar = el(`<div class="toolbar"></div>`);
  const search = el(`<input class="search" placeholder="Search player or team" aria-label="Search players" value="">`);
  search.value = state.query;
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
    const next = document.querySelector(".search");
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  });
  toolbar.append(search);
  const sort = el(`<select class="sort" aria-label="Sort"></select>`);
  for (const [id, label] of [
    ["rank", "Dynasty rank"],
    ["profit", "Expected profit"],
    ["roi", "ROI"],
    ["trend", "30-day rise"],
    ["gem", "Gem rate"],
  ]) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    if (state.sort === id) opt.selected = true;
    sort.append(opt);
  }
  sort.addEventListener("change", () => {
    state.sort = sort.value;
    render();
  });
  toolbar.append(sort);
  for (const item of ["ALL", "QB", "RB", "WR", "TE"]) {
    toolbar.append(chip(item === "ALL" ? "All" : item, state.pos === item, () => ((state.pos = item), render())));
  }
  for (const [id, label] of [
    ["all", "All classes"],
    ["2026", "2026"],
    ["2025", "2025"],
    ["2024", "2024"],
    ["2023", "2023"],
    ["earlier", "Earlier"],
  ]) {
    toolbar.append(chip(label, state.klass === id, () => ((state.klass = id), render())));
  }
  toolbar.append(chip("Has comps", state.onlyComps, () => ((state.onlyComps = !state.onlyComps), render())));
  toolbar.append(chip("Pop only", state.onlyPop, () => ((state.onlyPop = !state.onlyPop), render())));
  app.append(toolbar);

  const list = el(`<section></section>`);
  if (!rows.length) list.append(el(`<p class="muted">Nothing matches that cut.</p>`));
  for (const player of rows) {
    const best = bestOf(player);
    const button = el(`<button class="row" type="button"></button>`);
    button.append(
      el(`<div><span class="rank nums">${player.rank}</span> ${
        player.rankDelta ? `<span class="${player.rankDelta > 0 ? "profit" : "loss"} small">${player.rankDelta > 0 ? "▲" : "▼"} ${Math.abs(player.rankDelta)}</span>` : ""
      }</div>`),
    );
    button.append(
      el(`<div><div class="name">${escapeHtml(player.name)} <span class="small">${player.pos}${player.posRank} · ${player.team}${player.age != null ? ` · ${player.age}` : ""}${player.draftYear ? ` · ${player.draftYear}` : ""}</span></div>
        <p class="muted nums">Value ${player.value.toLocaleString()} / 30d <span class="${player.trend30 >= 0 ? "profit" : "loss"}">${player.trend30 >= 0 ? "+" : ""}${player.trend30.toLocaleString()}</span></p></div>`),
    );
    const slots = el(`<div class="slots"></div>`);
    for (const slot of player.cards) {
      const deal = slot.comp ? dealFor(slot.comp, board.priors[slot.product], overrideOf(player.name, slot.product)) : null;
      const hot = best && best.slot.product === slot.product ? " hot" : "";
      slots.append(
        el(`<div class="slot${hot}"><p class="small">${slot.label}</p>${
          deal
            ? `<p class="${deal.profit >= 0 ? "profit" : "loss"} nums">${signed(deal.profit)}</p><p class="small">${deal.gemIsPrior ? pct(deal.gem) + " prior" : pct(deal.gem) + " pop"}</p>`
            : `<p class="small">${statusCopy(slot.status)}</p>`
        }</div>`),
      );
    }
    button.append(slots);
    button.addEventListener("click", () => openPlayer(player));
    list.append(button);
  }
  app.append(list);
  app.append(
    el(`<footer class="foot"><p>${escapeHtml(board.model)}</p><p>Ranks: ${escapeHtml(board.sources.rankings)}. Prices: ${escapeHtml(board.sources.prices)}. Populations: ${escapeHtml(board.sources.pops)}. Sell fee defaults to 13.25% and grading to $29 all-in. Not a bid, a comp, or advice. 2025 Contenders Optic silver autos were not on the price guide. 2026 flagships are marked unreleased. This book refreshes dynasty ranks every morning.</p></footer>`),
  );

  if (state.selected) renderSheet();
}

function field(label, key, prefix, suffix, min, max, step) {
  const shown =
    key === "sellFeePct" ? Math.round(state.assumptions.sellFee * 10000) / 100 : state.assumptions[key];
  const node = el(
    `<label class="field">${label}<span class="box">${prefix}<input type="number" min="${min}" max="${max}" step="${step}" value="${shown}">${suffix}</span></label>`,
  );
  node.querySelector("input").addEventListener("change", (event) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(max, Math.max(min, next));
    if (key === "sellFeePct") state.assumptions.sellFee = clamped / 100;
    else state.assumptions[key] = clamped;
    render();
  });
  return node;
}

function chip(label, on, fn) {
  const node = el(`<button type="button" class="chip${on ? " on" : ""}">${label}</button>`);
  node.addEventListener("click", fn);
  return node;
}

function kpi(kicker, title, value, note, tone) {
  return el(
    `<article class="kpi"><p class="kicker">${kicker}</p><p class="small">${escapeHtml(title)}</p><strong class="${tone || ""} nums">${value}</strong><p class="small">${escapeHtml(note)}</p></article>`,
  );
}

function openPlayer(player) {
  state.selected = player.name;
  const best = bestOf(player);
  state.focus = best ? best.slot.product : PRODUCTS[0];
  history.replaceState(null, "", `#${slug(player.name)}`);
  render();
}

function renderSheet() {
  const player = state.board.players.find((p) => p.name === state.selected);
  if (!player) return;
  const mask = el(`<div class="mask"></div>`);
  mask.addEventListener("click", closeSheet);
  const sheet = el(`<aside class="sheet" role="dialog" aria-modal="true"></aside>`);
  const active = player.cards.find((slot) => slot.product === state.focus) || player.cards[0];
  const deals = player.cards.map((slot) =>
    slot.comp ? dealFor(slot.comp, state.board.priors[slot.product], overrideOf(player.name, slot.product)) : null,
  );
  const maxAbs = Math.max(1, ...deals.map((d) => (d ? Math.abs(d.profit) : 0)));
  sheet.append(
    el(`<div class="top"><div><h2 class="name">${escapeHtml(player.name)}</h2><p class="muted">Dynasty #${player.rank} · ${player.pos}${player.posRank} · ${player.team}${player.draftYear ? ` · ${player.draftYear} draft` : ""}</p></div></div>`),
  );
  const close = el(`<button class="close" type="button" aria-label="Close">×</button>`);
  close.addEventListener("click", closeSheet);
  sheet.querySelector(".top").append(close);
  player.cards.forEach((slot, i) => {
    const deal = deals[i];
    const btn = el(
      `<button type="button" class="slot cardbtn${state.focus === slot.product ? " on" : ""}"><div class="top"><span>${slot.label}</span><span class="${deal && deal.profit >= 0 ? "profit" : "loss"} nums">${deal ? signed(deal.profit) : statusCopy(slot.status)}</span></div><p class="small">${slot.blurb}</p></button>`,
    );
    if (deal) {
      const width = Math.max(4, (Math.abs(deal.profit) / maxAbs) * 100);
      const tone = deal.profit >= 0 ? "profit" : "loss";
      const bar = el(`<div class="bar"><i class="${tone}" style="width:${width}%"></i></div>`);
      btn.append(bar);
    }
    btn.addEventListener("click", () => {
      state.focus = slot.product;
      render();
    });
    sheet.append(btn);
  });
  if (active.comp) {
    const deal = dealFor(active.comp, state.board.priors[active.product], overrideOf(player.name, active.product));
    const plan = planFor(deal);
    const block = el(`<div></div>`);
    block.append(
      el(`<p class="kicker">${active.comp.year} ${escapeHtml(active.comp.set)} · ${escapeHtml(active.comp.parallel)} #${active.comp.number}</p>`),
    );
    const prices = el(`<div class="grid3"></div>`);
    for (const [label, value] of [
      ["Raw", money(active.comp.raw)],
      ["PSA 9", money(active.comp.psa9)],
      ["PSA 10", money(active.comp.psa10)],
    ]) {
      prices.append(el(`<div class="price"><p class="small">${label}</p><p class="nums">${value}</p></div>`));
    }
    block.append(prices);
    block.append(
      el(`<p class="small">${deal.gemIsPrior ? "Planner prior, not this card's pop" : "PSA population gem rate"} · ${pct(deal.gem)}${active.comp.pop ? ` · ${active.comp.gems.toLocaleString()} / ${active.comp.pop.toLocaleString()}` : ""}</p>`),
    );
    const range = el(`<input type="range" min="0" max="100" aria-label="Gem rate">`);
    range.value = String(Math.round(deal.gem * 100));
    range.addEventListener("input", () => {
      state.overrides[`${player.name}:${active.product}`] = Number(range.value) / 100;
      render();
    });
    block.append(range);
    const reset = el(`<button type="button" class="linkish">Reset gem rate</button>`);
    reset.addEventListener("click", () => {
      delete state.overrides[`${player.name}:${active.product}`];
      render();
    });
    block.append(reset);
    const facts = el(`<div class="grid2"></div>`);
    for (const [k, v, good] of [
      ["If it gems", signed(deal.upside), deal.upside >= 0],
      ["If it 9s", signed(deal.downside), deal.downside >= 0],
      ["Expected profit", signed(deal.profit), deal.profit >= 0],
      ["ROI on raw + grade", pct(deal.roi), deal.roi >= 0],
      ["Break-even", breakLabel(deal.breakeven), null],
      ["All-in cost", money(deal.cost), null],
    ]) {
      facts.append(el(`<div><p class="small">${k}</p><p class="${good == null ? "" : good ? "profit" : "loss"} nums">${v}</p></div>`));
    }
    block.append(facts);
    block.append(
      el(`<div class="note"><p class="kicker">Monthly plan on this card</p><p>${
        plan
          ? `${plan.cardsPerMonth.toFixed(1)} cards a month, about ${plan.cardsPerWeek.toFixed(1)} a week, to net ${money(state.assumptions.goal)}. Float before sales is about ${money(plan.capital)}.`
          : "Expected profit is not positive at this gem rate, fee, and grade cost."
      }</p></div>`),
    );
    sheet.append(block);
  } else {
    sheet.append(el(`<p class="muted">${statusCopy(active.status)}. Comp book covers 2023–2025 flagships priced on ${state.board.pricesAsOf}.</p>`));
  }
  document.body.append(mask, sheet);
  close.focus();
}

function closeSheet() {
  state.selected = null;
  history.replaceState(null, "", location.pathname);
  render();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&" + "amp;";
    if (ch === "<") return "&" + "lt;";
    if (ch === ">") return "&" + "gt;";
    if (ch === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selected) closeSheet();
});

fetch("data/board.json")
  .then((res) => {
    if (!res.ok) throw new Error("Board missing");
    return res.json();
  })
  .then((board) => {
    state.board = board;
    const id = location.hash.replace("#", "");
    const match = board.players.find((p) => slug(p.name) === id);
    if (match) {
      state.selected = match.name;
      const best = bestOf(match);
      if (best) state.focus = best.slot.product;
    }
    render();
  })
  .catch(() => {
    document.getElementById("app").textContent = "The board did not load.";
  });
