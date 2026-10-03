#!/usr/bin/env node
/**
 * Rebuild the dynasty + flagship card board.
 * Dynasty ranks always come from FantasyCalc (1QB, 12-team, full PPR).
 * Card comps stay on data/card-book.json unless a later fetch replaces them.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FC_URL =
  "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1";

const PRODUCTS = [
  { id: "prizm-silver", label: "Prizm Silver", blurb: "Rookie Silver Prizm" },
  { id: "optic-holo", label: "Optic Holo", blurb: "Holo Rated Rookie" },
  { id: "contenders-silver-auto", label: "Contenders Auto", blurb: "Optic silver autograph" },
];

function norm(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’.]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function todayStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function loadRankings() {
  const cache = "data/fantasycalc.json";
  try {
    const res = await fetch(FC_URL, {
      headers: { accept: "application/json", "user-agent": "flagship-ppr" },
    });
    if (!res.ok) throw new Error(`FantasyCalc ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json) || json.length < 50) throw new Error("FantasyCalc payload unexpected");
    writeJson(cache, json);
    return { rows: json, live: true };
  } catch (err) {
    if (existsSync(cache)) {
      console.warn(`FantasyCalc unreachable (${err.message}). Using cached ranks.`);
      return { rows: readJson(cache), live: false };
    }
    if (existsSync("data/board.json")) {
      console.warn(`FantasyCalc unreachable (${err.message}). Leaving the published board in place.`);
      return { rows: null, live: false };
    }
    throw err;
  }
}

function weekBaseline(historyDir, today) {
  if (!existsSync(historyDir)) return null;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const files = readdirSync(historyDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d <= cutoffStr)
    .sort();
  if (!files.length) return null;
  const date = files[files.length - 1];
  return { date, snapshot: readJson(join(historyDir, `${date}.json`)) };
}

function slotStatus(draftYear, comp) {
  if (comp) return "comp";
  if (draftYear != null && draftYear >= 2026) return "unreleased";
  if (draftYear != null && draftYear >= 2023 && draftYear <= 2025) return "missing";
  return "out-of-book";
}

function buildBoard(rows, book, baseline) {
  const byPlayer = new Map();
  for (const card of book.cards) {
    const key = norm(card.player);
    if (!byPlayer.has(key)) byPlayer.set(key, new Map());
    byPlayer.get(key).set(card.product, card);
  }

  const skill = rows
    .filter((row) => row?.player && ["QB", "RB", "WR", "TE"].includes(row.player.position))
    .sort((a, b) => a.overallRank - b.overallRank);

  const picked = [];
  const seen = new Set();
  for (const row of skill) {
    if (picked.length >= 100) break;
    picked.push(row);
    seen.add(norm(row.player.name));
  }
  for (const row of skill) {
    const key = norm(row.player.name);
    if (seen.has(key)) continue;
    if (byPlayer.has(key)) {
      picked.push(row);
      seen.add(key);
    }
  }

  const players = picked.map((row) => {
    const p = row.player;
    const key = norm(p.name);
    const draftYear = p.maybeDraftInfo?.year ?? null;
    const cardsFor = byPlayer.get(key);
    const base = baseline?.snapshot?.ranks?.[key];
    const rankDelta = base ? base.rank - row.overallRank : null;
    return {
      rank: row.overallRank,
      name: p.name,
      pos: p.position,
      team: p.maybeTeam || "FA",
      age: p.maybeAge == null ? null : Math.round(p.maybeAge * 10) / 10,
      draftYear,
      draftRound: p.maybeDraftInfo?.round ?? null,
      draftPick: p.maybeDraftInfo?.pick ?? null,
      value: row.value,
      trend30: row.trend30Day ?? 0,
      posRank: row.positionRank,
      rankDelta,
      inTop100: row.overallRank <= 100,
      cards: PRODUCTS.map((product) => {
        const comp = cardsFor?.get(product.id) ?? null;
        return {
          product: product.id,
          label: product.label,
          blurb: product.blurb,
          status: slotStatus(draftYear, comp),
          comp: comp
            ? {
                year: comp.year,
                set: comp.set,
                parallel: comp.parallel,
                number: comp.number,
                raw: comp.raw,
                psa9: comp.psa9,
                psa10: comp.psa10,
                gemRate: comp.gemRate,
                gems: comp.gems,
                pop: comp.pop,
                popAsOf: comp.popAsOf,
              }
            : null,
        };
      }),
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    rankingsAsOf: todayStamp(),
    pricesAsOf: book.pricesAsOf,
    weekBaseline: baseline?.date ?? null,
    format: "Dynasty · 1QB · 12 teams · full PPR",
    priors: book.priors,
    sources: {
      rankings: "FantasyCalc trade-derived values",
      prices: book.priceSource,
      pops: book.popSource,
    },
    model:
      "Expected sale is gem rate × PSA 10 + (1 − gem rate) × PSA 9, after the sell fee. Cost is the raw card plus grading. Only 9s and 10s are modeled, the same way a clean-submission profit planner treats the downside. A listed gem rate is PSA 10s divided by that card's PSA population. A prior is used only when population is not in the book, and it is labeled.",
    players,
  };
}

const book = readJson("data/card-book.json");
const { rows, live } = await loadRankings();
if (!rows) process.exit(0);

const historyDir = "data/history";
mkdirSync(historyDir, { recursive: true });
const today = todayStamp();
const baseline = weekBaseline(historyDir, today);
const board = buildBoard(rows, book, baseline);

const ranks = {};
for (const row of rows) {
  if (!row?.player?.name || row.player.position === "PICK") continue;
  ranks[norm(row.player.name)] = { rank: row.overallRank, value: row.value };
}
writeJson(join(historyDir, `${today}.json`), { date: today, ranks });

const outs = ["data/board.json"];
if (existsSync("public")) outs.push("public/data/board.json");
if (existsSync("pages-site")) outs.push("pages-site/data/board.json");
for (const out of outs) writeJson(out, board);

const withComp = board.players.filter((p) => p.cards.some((c) => c.comp)).length;
console.log(
  `Board ${board.players.length} players, ${withComp} with flagship comps. Rankings ${live ? "live" : "cached"}. Week baseline ${baseline?.date ?? "none"}.`,
);
