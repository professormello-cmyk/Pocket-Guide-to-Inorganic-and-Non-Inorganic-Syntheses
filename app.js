// Pocket Corridor Table — robust single-file app.js
// -------------------------------------------------
// Goals:
//  - Locale-safe numeric parsing (accepts "0,1" and "0.1"; strips spaces)
//  - Stable formatting with dot decimals
//  - Defensive 2×2 calculator (handles V=0)
//  - CSV loader with basic quoted-field support
//  - Optional cases.csv (won't break if missing)
//  - PCPT table filtering (symbol/DMC/note)
//
// NOTE: Sorting-by-Z (atomic number) can be added later as a separate step.

"use strict";

const kB_eV_per_K = 8.617333262e-5;

function abs(x){ return Math.abs(x); }
function clamp(x, a, b){ return Math.min(b, Math.max(a, x)); }

/**
 * Robust numeric parser:
 * - Accepts "0,1" or "0.1"
 * - Removes spaces (including NBSP; useful for "1 234,56")
 * - Converts ALL commas to dots
 * - Returns fallback for empty/invalid
 */
function toNum(x, fallback = NaN){
  const s0 = String(x ?? "").trim();
  if (!s0) return fallback;

  const s = s0.replace(/[\s\u00A0]/g, "").replace(/,/g, ".");
  const v = Number(s);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Always prints with dot as decimal separator.
 */
function fmt(x, n = 4){
  if (!Number.isFinite(x)) return "NaN";
  return Number(x).toFixed(n);
}

/**
 * 2×2 mixing block
 * denom    = sqrt(Δ² + 4V²)
 * R        = |Δ|/|V|
 * sin²φ    = (1 - Δ/denom)/2   (clamped to [0,1])
 * Δmix     = denom
 */
function calc2x2(delta, V){
  const d = toNum(delta, NaN);
  const v = toNum(V, NaN);

  if (!Number.isFinite(d) || !Number.isFinite(v)){
    return { R: NaN, sin2phi: NaN, DeltaMix: NaN };
  }

  if (v === 0){
    // V -> 0 limit: Δmix -> |Δ| ; convention for sin²φ
    const denom0 = abs(d);
    const sin2phi0 = (d >= 0) ? 0 : 1;
    return { R: Infinity, sin2phi: sin2phi0, DeltaMix: denom0 };
  }

  const denom = Math.sqrt(d*d + 4*v*v);
  const R = abs(d) / abs(v);
  const sin2phi = clamp(0.5 * (1 - d/denom), 0, 1);

  return { R, sin2phi, DeltaMix: denom };
}

/**
 * Heuristic CRS classifier (EDIT thresholds to match paper)
 */
function classifyCRS(dop, R){
  const D = toNum(dop, NaN);
  const r = toNum(R, NaN);
  if (!Number.isFinite(D) || !Number.isFinite(r)) return 3;

  if (D >= 0.5 && r >= 5) return 0;
  if (D >= 0.2 && r >= 2) return 1;
  if (D >= 0.1 && r >= 1) return 2;
  return 3;
}

function renderOut(){
  const delta = toNum(document.getElementById("delta")?.value, NaN);
  const V     = toNum(document.getElementById("V")?.value, NaN);
  const dop   = toNum(document.getElementById("dop")?.value, NaN);
  const Traw  = toNum(document.getElementById("T")?.value, 300);

  const { R, sin2phi, DeltaMix } = calc2x2(delta, V);
  const CRS = classifyCRS(dop, R);

  const T = Number.isFinite(Traw) ? Math.round(Traw) : 300;
  const kBT = kB_eV_per_K * T;

  const out = document.getElementById("out");
  if (!out) return;

  const Rtxt   = (R === Infinity) ? "∞" : fmt(R, 3);
  const sinTxt = fmt(sin2phi, 3);
  const mixTxt = Number.isFinite(DeltaMix) ? `${fmt(DeltaMix, 3)} eV` : "NaN";

  out.innerHTML = `
    <div>
      <span class="tag">R</span> ${Rtxt} &nbsp; | &nbsp;
      <span class="tag">sin²φ</span> ${sinTxt} &nbsp; | &nbsp;
      <span class="tag">Δmix</span> ${mixTxt}
    </div>
    <div style="margin-top:6px">
      <span class="tag">CRS</span> <b>${CRS}</b> &nbsp; | &nbsp;
      <span class="tag">kBT</span> ${fmt(kBT, 4)} eV (T=${T}K)
    </div>
  `;
}

// Wire calculator
document.getElementById("calc")?.addEventListener("click", renderOut);
renderOut();

// ------------------------------------------------------
// CSV loader (no deps) — basic quoted-field support
// ------------------------------------------------------

async function fetchText(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

function splitCSVLine(line){
  const out = [];
  let cur = "";
  let q = false;

  for (let i = 0; i < line.length; i++){
    const c = line[i];

    if (c === '"'){
      const next = line[i + 1];
      if (q && next === '"'){ cur += '"'; i++; } // escaped quote
      else { q = !q; }
    } else if (c === "," && !q){
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(text){
  const lines = String(text ?? "").trim().split(/\r?\n/).filter(s => s.trim().length);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]).map(s => s.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++){
    const parts = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (parts[idx] ?? "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function renderTable(containerId, headers, rows){
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!rows.length){
    el.innerHTML = "<p class='small'>No data.</p>";
    return;
  }

  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    rows.map(r => `<tr>${headers.map(h => `<td>${(r[h] ?? "")}</td>`).join("")}</tr>`).join("")
  }</tbody>`;

  el.innerHTML = `<table>${thead}${tbody}</table>`;
}

let pcptRaw = [];
let pcptHeaders = [];

async function loadPCPT(){
  const t = await fetchText("data/pcpt.csv");
  const { headers, rows } = parseCSV(t);

  pcptRaw = rows;
  pcptHeaders = headers;

  const q = (document.getElementById("filter")?.value || "").toLowerCase().trim();
  const filtered = q
    ? rows.filter(r =>
        (r.symbol || "").toLowerCase().includes(q) ||
        (r.DMC    || "").toLowerCase().includes(q) ||
        (r.note   || "").toLowerCase().includes(q)
      )
    : rows;

  renderTable("pcptTable", headers, filtered);
}

async function loadCasesOptional(){
  try{
    const t = await fetchText("data/cases.csv");
    const { headers, rows } = parseCSV(t);

    const augHeaders = headers.concat(["R", "sin2phi", "DeltaMix", "CRS_auto"]);
    const augRows = rows.map(r => {
      const delta = toNum(r.delta_eV, NaN);
      const V     = toNum(r.V_eV, NaN);
      const dop   = toNum(r.DeltaOp_eV, NaN);

      const { R, sin2phi, DeltaMix } = calc2x2(delta, V);

      return {
        ...r,
        R:        (R === Infinity) ? "∞" : fmt(R, 3),
        sin2phi:  fmt(sin2phi, 3),
        DeltaMix: Number.isFinite(DeltaMix) ? fmt(DeltaMix, 3) : "NaN",
        CRS_auto: classifyCRS(dop, R)
      };
    });

    renderTable("casesTable", augHeaders, augRows);
  } catch(e){
    console.warn("Cases CSV not loaded (optional):", e.message);
    const el = document.getElementById("casesTable");
    if (el) el.innerHTML = "<p class='small'>No <code>data/cases.csv</code> (optional).</p>";
  }
}

// Buttons / filters
document.getElementById("reload")?.addEventListener("click", async () => {
  try{
    await loadPCPT();
    await loadCasesOptional();
  } catch(e){
    alert("CSV load error: " + e.message);
  }
});

document.getElementById("filter")?.addEventListener("input", () => {
  const q = (document.getElementById("filter")?.value || "").toLowerCase().trim();

  const filtered = q
    ? pcptRaw.filter(r =>
        (r.symbol || "").toLowerCase().includes(q) ||
        (r.DMC    || "").toLowerCase().includes(q) ||
        (r.note   || "").toLowerCase().includes(q)
      )
    : pcptRaw;

  const headers = pcptHeaders.length
    ? pcptHeaders
    : (pcptRaw[0] ? Object.keys(pcptRaw[0]) : []);

  renderTable("pcptTable", headers, filtered);
});

// Initial load
(async () => {
  try{
    await loadPCPT();
    await loadCasesOptional();
  } catch(e){
    console.warn("Initial CSV load failed:", e.message);
  }
})();

// Service worker registration
if ("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("sw.js"); } catch(e) {}
  });
}
