// Pocket Corridor Table (sd/df) — robust + clickable periodic table
// ---------------------------------------------------------------
// This file is intentionally dependency-free (no frameworks).
// It provides:
// 1) A 2×2 mixing calculator (delta, V, DeltaOp, T) + derived metrics
// 2) CSV loading for PCPT rows (data/pcpt.csv) + optional cases (data/cases.csv)
// 3) A clickable periodic table UI with per-element details
// 4) A didactic parameter-explanation panel (auto-created if missing)
//
// IMPORTANT: The "help panel" below explains the calculator in undergraduate-level English,
// aimed at synthesis planning (inorganic, bioinorganic, organic, catalysis).
//
// kB in eV/K (CODATA / NIST): 8.617333262...×10^-5 eV/K

const kB_eV_per_K = 8.617333262e-5;

function abs(x){ return Math.abs(x); }
function clamp(x, a, b){ return Math.min(b, Math.max(a, x)); }

/**
 * Robust numeric parser:
 * - Accepts "0,1" or "0.1"
 * - Removes spaces (including thousands separators like "1 234,56")
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

/** Always prints with dot as decimal separator (JS does). */
function fmt(x, n = 4){
  if (!Number.isFinite(x)) return "NaN";
  return Number(x).toFixed(n);
}

/**
 * 2×2 mixing model (two-level / two-channel competition)
 *
 * Interpret delta (Δ) as the *bare energy separation* between two competing frontier "channels"
 * (examples: s↔d, d↔d, HS↔LS, SOC-split branches, f/rel).
 *
 * Interpret V as the *coupling/mixing* between them (hybridization / interaction).
 *
 * Then:
 *   Δmix = sqrt(Δ^2 + 4 V^2)  is the actual split after mixing (avoided-crossing gap).
 *   R = |Δ|/|V| is a dimensionless "distance from the corridor"
 *   sin^2 φ measures mixing weight of one channel in the lower eigenstate (0..1)
 */
function calc2x2(delta, V){
  const d = toNum(delta, NaN);
  const v = toNum(V, NaN);

  if (!Number.isFinite(d) || !Number.isFinite(v)) {
    return { R: NaN, sin2phi: NaN, DeltaMix: NaN };
  }
  if (v === 0){
    const denom0 = abs(d);
    const sin2phi0 = d >= 0 ? 0 : 1; // convention in the V->0 limit
    return { R: Infinity, sin2phi: sin2phi0, DeltaMix: denom0 };
  }

  const denom = Math.sqrt(d*d + 4*v*v);
  const R = abs(d)/abs(v);
  const sin2phi = clamp(0.5*(1 - d/denom), 0, 1);

  return { R, sin2phi, DeltaMix: denom };
}

// Simple heuristic classifier (EDIT to match your final paper thresholds)
function classifyCRS(dop, R){
  const D = toNum(dop, NaN);
  const r = toNum(R, NaN);
  if (!Number.isFinite(D) || !Number.isFinite(r)) return 3;

  // Heuristic logic (placeholder): larger operational gap + large R => safer (low risk)
  if (D >= 0.5 && r >= 5) return 0;
  if (D >= 0.2 && r >= 2) return 1;
  if (D >= 0.1 && r >= 1) return 2;
  return 3;
}

/**
 * Derived, synthesis-facing diagnostics (computed from delta, V, DeltaOp, T):
 * - kBT: thermal energy scale (eV) at temperature T
 * - theta_T: "thermal corridor score" ≈ kBT / max(Δmix, tiny)
 * - tau: a crude "toggle propensity" proxy combining thermal & mixing (0..~1)
 *
 * NOTE: These are *didactic planning metrics*, not claims of kinetics by themselves.
 * They help decide whether "tiny spectral gaps" are plausibly activated by temperature.
 */
function derivedDiagnostics(delta, V, T){
  const d = toNum(delta, NaN);
  const v = toNum(V, NaN);
  const Tn = toNum(T, 300);
  const TT = Number.isFinite(Tn) ? Math.max(1, Math.round(Tn)) : 300;
  const kBT = kB_eV_per_K * TT;

  const { DeltaMix, sin2phi, R } = calc2x2(d, v);

  // protect division by zero
  const gap = Number.isFinite(DeltaMix) ? Math.max(DeltaMix, 1e-12) : NaN;

  const theta_T = Number.isFinite(gap) ? (kBT / gap) : NaN;

  // "tau" is a heuristic: mixing (sin2phi near 0.5) + thermal access => higher.
  // A smooth bounded proxy: tau = (2*sqrt(sin2phi*(1-sin2phi))) * tanh(theta_T)
  let mixAmp = NaN;
  if (Number.isFinite(sin2phi)){
    mixAmp = 2 * Math.sqrt(Math.max(0, sin2phi*(1 - sin2phi))); // 0..1
  }
  const tau = (Number.isFinite(theta_T) && Number.isFinite(mixAmp))
    ? (mixAmp * Math.tanh(theta_T))
    : NaN;

  return { kBT, theta_T, tau, DeltaMix, sin2phi, R, TT };
}

function renderOut(){
  const delta = toNum(document.getElementById("delta")?.value, NaN);
  const V     = toNum(document.getElementById("V")?.value, NaN);
  const dop   = toNum(document.getElementById("dop")?.value, NaN);
  const Traw  = toNum(document.getElementById("T")?.value, 300);

  const { kBT, theta_T, tau, DeltaMix, sin2phi, R, TT } = derivedDiagnostics(delta, V, Traw);
  const CRS = classifyCRS(dop, R);

  const out = document.getElementById("out");
  if (!out) return;

  const Rtxt = (R === Infinity) ? "∞" : fmt(R, 3);
  const sinTxt = fmt(sin2phi, 3);
  const mixTxt = Number.isFinite(DeltaMix) ? `${fmt(DeltaMix,3)} eV` : "NaN";

  const kBTtxt = Number.isFinite(kBT) ? `${fmt(kBT,4)} eV` : "NaN";
  const thetaTxt = Number.isFinite(theta_T) ? fmt(theta_T, 3) : "NaN";
  const tauTxt = Number.isFinite(tau) ? fmt(tau, 3) : "NaN";

  out.innerHTML = `
    <div>
      <span class="tag">R</span> ${escapeHTML(Rtxt)} &nbsp; | &nbsp;
      <span class="tag">sin²φ</span> ${escapeHTML(sinTxt)} &nbsp; | &nbsp;
      <span class="tag">Δmix</span> ${escapeHTML(mixTxt)}
    </div>
    <div style="margin-top:6px">
      <span class="tag">CRS</span> <b>${escapeHTML(String(CRS))}</b> &nbsp; | &nbsp;
      <span class="tag">kBT</span> ${escapeHTML(kBTtxt)} (T=${escapeHTML(String(TT))} K)
    </div>
    <div style="margin-top:6px">
      <span class="tag">θT</span> ${escapeHTML(thetaTxt)} &nbsp; | &nbsp;
      <span class="tag">τ</span> ${escapeHTML(tauTxt)}
      <span class="small" style="margin-left:8px;color:var(--muted, #9aa4af)">
        (planning proxies: thermal access & mixing amplitude)
      </span>
    </div>
  `;
}

// Wire calculator
document.getElementById("calc")?.addEventListener("click", renderOut);
renderOut();

// ------------------------------------------------------
// Calculator help panel (auto-created if missing)
// ------------------------------------------------------

function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

const CALC_HELP_HTML = `
  <div class="help-block">
    <h3 style="margin:0 0 8px 0;font-size:16px">What the 2×2 calculator means (undergrad level)</h3>
    <p class="small" style="margin:0 0 10px 0">
      Think of many “chemical surprises” as a competition between two nearby electronic
      possibilities (“channels”) that can exchange character.
      Examples: <b>s↔d</b> promotion in transition metals, <b>d↔d</b> near-degeneracy inside the d-manifold,
      <b>HS↔LS</b> (spin crossover) in coordination chemistry, <b>SOC</b>-reordered frontier levels in heavy elements,
      and <b>f/rel</b> effects in lanthanides/actinides.
    </p>

    <h4 style="margin:10px 0 6px 0;font-size:14px">Inputs</h4>
    <ul class="small" style="margin:0 0 10px 18px;padding:0">
      <li>
        <b>Δ (delta, eV)</b> — the <i>bare separation</i> between two candidate frontier channels
        before they mix. In synthesis terms: how far apart are the two “stories” the atom/complex could follow?
        <br><span style="color:var(--muted,#9aa4af)">How to influence Δ:</span>
        ligand field strength (strong-field vs weak-field ligands), oxidation state, geometry (octahedral vs square-planar),
        donor/acceptor ligands, protonation, solvent polarity, and external fields (electrochemical potential).
      </li>
      <li style="margin-top:6px">
        <b>V (eV)</b> — the <i>coupling / hybridization strength</i> that mixes the channels.
        Bigger V means the system can “borrow character” between the two options more easily.
        <br><span style="color:var(--muted,#9aa4af)">How to influence V:</span>
        covalency (soft ligands for soft metals), π-backbonding (CO/olefins),
        orbital overlap (shorter bonds), bridging ligands, and heavier atoms (often stronger mixing via relativistic/SOC mechanisms).
      </li>
      <li style="margin-top:6px">
        <b>Δop (operational gap, eV)</b> — your <i>task-specific gap</i>:
        the energy distance between the “active manifold” and the nearest competitor that can steal the chemistry.
        <br><span style="color:var(--muted,#9aa4af)">Practical read:</span>
        large Δop means the active electronic picture is stable across conditions;
        small Δop means small changes (ligand, solvent, temperature) can flip reactivity or spin state.
      </li>
      <li style="margin-top:6px">
        <b>T (K)</b> — temperature. It sets the thermal scale <b>kBT</b> (in eV).
        If kBT becomes comparable to a small gap, population/entropy effects can change the observed chemistry.
      </li>
    </ul>

    <h4 style="margin:10px 0 6px 0;font-size:14px">Outputs (what you compute)</h4>
    <ul class="small" style="margin:0 0 10px 18px;padding:0">
      <li>
        <b>Δmix (eV)</b> = √(Δ² + 4V²) — the <i>avoided-crossing gap</i>.
        Even if Δ is tiny, mixing opens a gap. If Δmix is tiny too, you are in a “corridor” region:
        small perturbations can reorder frontier character.
      </li>
      <li style="margin-top:6px">
        <b>R</b> = |Δ|/|V| — a dimensionless “distance from the corridor”.
        <br><span style="color:var(--muted,#9aa4af)">Rule of thumb:</span>
        R ≫ 1 → weak mixing (safe, stable electronic identity);
        R ~ 1 → strong competition (corridor);
        R ≪ 1 → almost maximal mixing (identity is fragile).
      </li>
      <li style="margin-top:6px">
        <b>sin²φ</b> — mixing weight (0..1). Near 0 or 1: mostly one channel. Near 0.5: strong hybrid character.
        <br><span style="color:var(--muted,#9aa4af)">Why you care:</span>
        strong mixing often correlates with “condition-sensitive” selectivity in catalysis
        (different products under small changes in ligands/solvent/additives).
      </li>
      <li style="margin-top:6px">
        <b>kBT (eV)</b> — thermal energy at temperature T. If kBT is not small compared to gaps,
        thermal population and entropy can alter observed states (especially HS↔LS).
      </li>
      <li style="margin-top:6px">
        <b>θT</b> = kBT/Δmix — a <i>thermal access</i> proxy. Larger θT means thermal energy can “see” the gap.
      </li>
      <li style="margin-top:6px">
        <b>τ</b> — a bounded planning proxy combining <i>mixing amplitude</i> and <i>thermal access</i>.
        Larger τ suggests “you should expect switching risk” as conditions change.
      </li>
      <li style="margin-top:6px">
        <b>CRS</b> (0–3) — corridor risk score (currently heuristic thresholds in this file).
        Higher CRS means higher risk that chemistry flips under realistic variations.
      </li>
    </ul>

    <h4 style="margin:10px 0 6px 0;font-size:14px">How to use this in synthesis planning</h4>
    <ol class="small" style="margin:0 0 10px 18px;padding:0">
      <li>
        <b>Pick a target reaction role</b>: redox catalyst, cross-coupling center, Lewis acid, spin-state switch,
        bioinorganic binding site (O₂/NO/CO), etc.
      </li>
      <li style="margin-top:6px">
        <b>Map your “knobs” to Δ and V</b>:
        <ul style="margin:6px 0 0 18px;padding:0">
          <li><b>Δ knobs</b>: ligand field strength, oxidation state, geometry, hard/soft donors, protonation.</li>
          <li><b>V knobs</b>: covalency & overlap, π-backbonding ligands (CO/olefins), bridging, heavier atoms/SOC.</li>
        </ul>
      </li>
      <li style="margin-top:6px">
        <b>Decide if you want stability or switchability</b>:
        <ul style="margin:6px 0 0 18px;padding:0">
          <li><b>Stable catalyst identity</b> (predictable selectivity): aim for larger R and larger Δop.</li>
          <li><b>Tunable/selectivity-rich system</b> (responsive catalysis, spin-state control): corridor region (R~1) is useful,
              but you must control conditions carefully.</li>
        </ul>
      </li>
      <li style="margin-top:6px">
        <b>Temperature sanity check</b>:
        if θT is large, temperature can activate switching (especially in spin-crossover / bioinorganic binding equilibria).
      </li>
    </ol>

    <p class="small" style="margin:0;color:var(--muted,#9aa4af)">
      Warning: this calculator is a <b>structure-to-risk lens</b>, not a kinetics simulator.
      It is meant to reduce blind trial-and-error by highlighting when you are near a spectral competition corridor.
    </p>
  </div>
`;

function ensureCalculatorHelpPanel(){
  // Strategy: find a calculator container; if not found, do nothing.
  // We try common ids: "calculator", "calcHelp", "helpToggle", "helpPanel".
  const calcRoot =
    document.getElementById("calculator") ||
    document.getElementById("calcRoot") ||
    document.getElementById("calcBox");

  if (!calcRoot) return;

  // If user already has a help panel in HTML, just wire it.
  let toggle = document.getElementById("helpToggle");
  let panel  = document.getElementById("helpPanel");

  if (!toggle || !panel){
    // Create minimal UI elements (works even if CSS doesn't define these classes)
    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";

    toggle = document.createElement("button");
    toggle.id = "helpToggle";
    toggle.type = "button";
    toggle.className = "btn";
    toggle.style.cursor = "pointer";
    toggle.style.marginTop = "8px";
    toggle.innerHTML = "▼ Explain parameters (click)";

    panel = document.createElement("div");
    panel.id = "helpPanel";
    panel.style.display = "none";
    panel.style.marginTop = "10px";
    panel.innerHTML = CALC_HELP_HTML;

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    calcRoot.appendChild(wrap);
  }

  toggle.addEventListener("click", ()=>{
    const open = panel.style.display !== "none";
    panel.style.display = open ? "none" : "block";
    toggle.innerHTML = open ? "▼ Explain parameters (click)" : "▲ Hide explanation";
  });
}

// Ensure help panel after load (also safe to call multiple times)
ensureCalculatorHelpPanel();

// ------------------------------------------------------
// CSV loader (no deps) — slightly more robust
// ------------------------------------------------------

async function fetchText(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

// Minimal CSV parsing with basic quoted-field support
function splitCSVLine(line){
  const out = [];
  let cur = "";
  let q = false;

  for (let i = 0; i < line.length; i++){
    const c = line[i];

    if (c === '"'){
      const next = line[i+1];
      if (q && next === '"'){ cur += '"'; i++; } // escaped ""
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
  const lines = text.trim().split(/\r?\n/).filter(s => s.trim().length);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]).map(s => s.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++){
    const parts = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => row[h] = (parts[idx] ?? "").trim());
    rows.push(row);
  }
  return { headers, rows };
}

// ------------------------------------------------------
// NEW: status-aware semantics (no more "CRS=0 placebo")
// ------------------------------------------------------

function normStatus(row){
  const s = String(row?.status ?? row?.Status ?? "").trim().toLowerCase();
  if (s === "high" || s === "low" || s === "insufficient") return s;
  return ""; // unknown / legacy
}

function isPlaceholderPCPT(row){
  // Priority 1: explicit status
  const st = normStatus(row);
  if (st === "insufficient") return true;

  // Legacy fallback: TBD/TODO
  const dmc = String(row?.DMC ?? "").trim().toUpperCase();
  const note = String(row?.note ?? "").trim();
  const noteUp = note.toUpperCase();
  return (dmc === "TBD") || noteUp.startsWith("TODO:");
}

function uiRow(row){
  // returns a UI view; never mutates original
  if (!row) return row;

  const st = normStatus(row);
  const reason = String(row?.reason ?? row?.Reason ?? "").trim();
  const note = String(row?.note ?? "").trim();
  const dmc = String(row?.DMC ?? "").trim();

  // If insufficient or placeholder, enforce explicit UI semantics
  if (st === "insufficient" || isPlaceholderPCPT(row)){
    return {
      ...row,
      CRS: "—",
      DMC: (dmc && dmc.toUpperCase() !== "TBD") ? dmc : "—",
      status: st || "insufficient",
      reason: reason || "Unclassified: placeholder (no rule applied yet)",
      note: note || "Not classified yet."
    };
  }

  return { ...row };
}

function renderTable(containerId, headers, rows){
  const el = document.getElementById(containerId);
  if(!el) return;

  if(!rows.length){
    el.innerHTML = "<p class='small'>No data.</p>";
    return;
  }

  const thead = `<thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join("")}</tr></thead>`;

  const tbody = `<tbody>${
    rows.map(r=>{
      const rr = uiRow(r);
      return `<tr>${
        headers.map(h => `<td>${escapeHTML(rr?.[h] ?? "")}</td>`).join("")
      }</tr>`;
    }).join("")
  }</tbody>`;

  el.innerHTML = `<table>${thead}${tbody}</table>`;
}

let pcptRaw = [];
let pcptHeaders = [];
let pcptBySymbol = new Map(); // symbol -> row

async function loadPCPT(){
  const t = await fetchText("data/pcpt.csv");
  const { headers, rows } = parseCSV(t);

  pcptRaw = rows;
  pcptHeaders = headers;

  pcptBySymbol = new Map();
  for (const r of rows){
    const sym = (r.symbol || r.Symbol || "").trim();
    if (sym) pcptBySymbol.set(sym, r);
  }

  const q = (document.getElementById("filter")?.value || "").toLowerCase().trim();
  const filtered = q ? rows.filter(r =>
    (r.symbol || "").toLowerCase().includes(q) ||
    (r.DMC || "").toLowerCase().includes(q) ||
    (r.note || "").toLowerCase().includes(q) ||
    (r.status || "").toLowerCase().includes(q) ||
    (r.reason || "").toLowerCase().includes(q)
  ) : rows;

  renderTable("pcptTable", headers, filtered);

  // After PCPT loads, (re)render periodic table
  renderPeriodicTable();
}

async function loadCasesOptional(){
  // OPTIONAL: if data/cases.csv does not exist, do not break the app
  try{
    const t = await fetchText("data/cases.csv");
    const { headers, rows } = parseCSV(t);

    const augHeaders = headers.concat(["R","sin2phi","DeltaMix","kBT_eV","thetaT","tau","CRS_auto"]);
    const augRows = rows.map(r=>{
      const delta = toNum(r.delta_eV, NaN);
      const V = toNum(r.V_eV, NaN);
      const dop = toNum(r.DeltaOp_eV, NaN);
      const T = toNum(r.T_K ?? r.T ?? 300, 300);

      const diag = derivedDiagnostics(delta, V, T);
      const CRS_auto = classifyCRS(dop, diag.R);

      return {
        ...r,
        R: (diag.R === Infinity) ? "∞" : fmt(diag.R,3),
        sin2phi: fmt(diag.sin2phi,3),
        DeltaMix: Number.isFinite(diag.DeltaMix) ? fmt(diag.DeltaMix,3) : "NaN",
        kBT_eV: Number.isFinite(diag.kBT) ? fmt(diag.kBT,4) : "NaN",
        thetaT: Number.isFinite(diag.theta_T) ? fmt(diag.theta_T,3) : "NaN",
        tau: Number.isFinite(diag.tau) ? fmt(diag.tau,3) : "NaN",
        CRS_auto
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
document.getElementById("reload")?.addEventListener("click", async ()=>{
  try{
    await loadPCPT();
    await loadCasesOptional();
  } catch(e){
    alert("CSV load error: " + e.message);
  }
});

document.getElementById("filter")?.addEventListener("input", ()=>{
  const q = (document.getElementById("filter")?.value || "").toLowerCase().trim();

  const filtered = q ? pcptRaw.filter(r =>
    (r.symbol || "").toLowerCase().includes(q) ||
    (r.DMC || "").toLowerCase().includes(q) ||
    (r.note || "").toLowerCase().includes(q) ||
    (r.status || "").toLowerCase().includes(q) ||
    (r.reason || "").toLowerCase().includes(q)
  ) : pcptRaw;

  const headers = pcptHeaders.length
    ? pcptHeaders
    : (pcptRaw[0] ? Object.keys(pcptRaw[0]) : []);

  renderTable("pcptTable", headers, filtered);
});

// ------------------------------------------------------
// Periodic table (clickable)
// ------------------------------------------------------

let activeSymbol = null;

/**
 * Minimal element metadata for display (symbol, Z, name).
 */
const ELEMENTS = [
  {Z:1,s:"H",n:"Hydrogen"}, {Z:2,s:"He",n:"Helium"},
  {Z:3,s:"Li",n:"Lithium"}, {Z:4,s:"Be",n:"Beryllium"},
  {Z:5,s:"B",n:"Boron"}, {Z:6,s:"C",n:"Carbon"},
  {Z:7,s:"N",n:"Nitrogen"}, {Z:8,s:"O",n:"Oxygen"},
  {Z:9,s:"F",n:"Fluorine"}, {Z:10,s:"Ne",n:"Neon"},
  {Z:11,s:"Na",n:"Sodium"}, {Z:12,s:"Mg",n:"Magnesium"},
  {Z:13,s:"Al",n:"Aluminium"}, {Z:14,s:"Si",n:"Silicon"},
  {Z:15,s:"P",n:"Phosphorus"}, {Z:16,s:"S",n:"Sulfur"},
  {Z:17,s:"Cl",n:"Chlorine"}, {Z:18,s:"Ar",n:"Argon"},
  {Z:19,s:"K",n:"Potassium"}, {Z:20,s:"Ca",n:"Calcium"},
  {Z:21,s:"Sc",n:"Scandium"}, {Z:22,s:"Ti",n:"Titanium"},
  {Z:23,s:"V",n:"Vanadium"}, {Z:24,s:"Cr",n:"Chromium"},
  {Z:25,s:"Mn",n:"Manganese"}, {Z:26,s:"Fe",n:"Iron"},
  {Z:27,s:"Co",n:"Cobalt"}, {Z:28,s:"Ni",n:"Nickel"},
  {Z:29,s:"Cu",n:"Copper"}, {Z:30,s:"Zn",n:"Zinc"},
  {Z:31,s:"Ga",n:"Gallium"}, {Z:32,s:"Ge",n:"Germanium"},
  {Z:33,s:"As",n:"Arsenic"}, {Z:34,s:"Se",n:"Selenium"},
  {Z:35,s:"Br",n:"Bromine"}, {Z:36,s:"Kr",n:"Krypton"},
  {Z:37,s:"Rb",n:"Rubidium"}, {Z:38,s:"Sr",n:"Strontium"},
  {Z:39,s:"Y",n:"Yttrium"}, {Z:40,s:"Zr",n:"Zirconium"},
  {Z:41,s:"Nb",n:"Niobium"}, {Z:42,s:"Mo",n:"Molybdenum"},
  {Z:43,s:"Tc",n:"Technetium"}, {Z:44,s:"Ru",n:"Ruthenium"},
  {Z:45,s:"Rh",n:"Rhodium"}, {Z:46,s:"Pd",n:"Palladium"},
  {Z:47,s:"Ag",n:"Silver"}, {Z:48,s:"Cd",n:"Cadmium"},
  {Z:49,s:"In",n:"Indium"}, {Z:50,s:"Sn",n:"Tin"},
  {Z:51,s:"Sb",n:"Antimony"}, {Z:52,s:"Te",n:"Tellurium"},
  {Z:53,s:"I",n:"Iodine"}, {Z:54,s:"Xe",n:"Xenon"},
  {Z:55,s:"Cs",n:"Caesium"}, {Z:56,s:"Ba",n:"Barium"},
  {Z:57,s:"La",n:"Lanthanum"}, {Z:58,s:"Ce",n:"Cerium"},
  {Z:59,s:"Pr",n:"Praseodymium"}, {Z:60,s:"Nd",n:"Neodymium"},
  {Z:61,s:"Pm",n:"Promethium"}, {Z:62,s:"Sm",n:"Samarium"},
  {Z:63,s:"Eu",n:"Europium"}, {Z:64,s:"Gd",n:"Gadolinium"},
  {Z:65,s:"Tb",n:"Terbium"}, {Z:66,s:"Dy",n:"Dysprosium"},
  {Z:67,s:"Ho",n:"Holmium"}, {Z:68,s:"Er",n:"Erbium"},
  {Z:69,s:"Tm",n:"Thulium"}, {Z:70,s:"Yb",n:"Ytterbium"},
  {Z:71,s:"Lu",n:"Lutetium"}, {Z:72,s:"Hf",n:"Hafnium"},
  {Z:73,s:"Ta",n:"Tantalum"}, {Z:74,s:"W",n:"Tungsten"},
  {Z:75,s:"Re",n:"Rhenium"}, {Z:76,s:"Os",n:"Osmium"},
  {Z:77,s:"Ir",n:"Iridium"}, {Z:78,s:"Pt",n:"Platinum"},
  {Z:79,s:"Au",n:"Gold"}, {Z:80,s:"Hg",n:"Mercury"},
  {Z:81,s:"Tl",n:"Thallium"}, {Z:82,s:"Pb",n:"Lead"},
  {Z:83,s:"Bi",n:"Bismuth"}, {Z:84,s:"Po",n:"Polonium"},
  {Z:85,s:"At",n:"Astatine"}, {Z:86,s:"Rn",n:"Radon"},
  {Z:87,s:"Fr",n:"Francium"}, {Z:88,s:"Ra",n:"Radium"},
  {Z:89,s:"Ac",n:"Actinium"}, {Z:90,s:"Th",n:"Thorium"},
  {Z:91,s:"Pa",n:"Protactinium"}, {Z:92,s:"U",n:"Uranium"},
  {Z:93,s:"Np",n:"Neptunium"}, {Z:94,s:"Pu",n:"Plutonium"},
  {Z:95,s:"Am",n:"Americium"}, {Z:96,s:"Cm",n:"Curium"},
  {Z:97,s:"Bk",n:"Berkelium"}, {Z:98,s:"Cf",n:"Californium"},
  {Z:99,s:"Es",n:"Einsteinium"}, {Z:100,s:"Fm",n:"Fermium"},
  {Z:101,s:"Md",n:"Mendelevium"}, {Z:102,s:"No",n:"Nobelium"},
  {Z:103,s:"Lr",n:"Lawrencium"}, {Z:104,s:"Rf",n:"Rutherfordium"},
  {Z:105,s:"Db",n:"Dubnium"}, {Z:106,s:"Sg",n:"Seaborgium"},
  {Z:107,s:"Bh",n:"Bohrium"}, {Z:108,s:"Hs",n:"Hassium"},
  {Z:109,s:"Mt",n:"Meitnerium"}, {Z:110,s:"Ds",n:"Darmstadtium"},
  {Z:111,s:"Rg",n:"Roentgenium"}, {Z:112,s:"Cn",n:"Copernicium"},
  {Z:113,s:"Nh",n:"Nihonium"}, {Z:114,s:"Fl",n:"Flerovium"},
  {Z:115,s:"Mc",n:"Moscovium"}, {Z:116,s:"Lv",n:"Livermorium"},
  {Z:117,s:"Ts",n:"Tennessine"}, {Z:118,s:"Og",n:"Oganesson"},
];

const E_BY_SYMBOL = new Map(ELEMENTS.map(e => [e.s, e]));

// Layout positions (group/period)
const MAIN_LAYOUT = [
  {p:1,g:1,s:"H"}, {p:1,g:18,s:"He"},
  {p:2,g:1,s:"Li"}, {p:2,g:2,s:"Be"}, {p:2,g:13,s:"B"}, {p:2,g:14,s:"C"}, {p:2,g:15,s:"N"}, {p:2,g:16,s:"O"}, {p:2,g:17,s:"F"}, {p:2,g:18,s:"Ne"},
  {p:3,g:1,s:"Na"}, {p:3,g:2,s:"Mg"}, {p:3,g:13,s:"Al"}, {p:3,g:14,s:"Si"}, {p:3,g:15,s:"P"}, {p:3,g:16,s:"S"}, {p:3,g:17,s:"Cl"}, {p:3,g:18,s:"Ar"},
  {p:4,g:1,s:"K"}, {p:4,g:2,s:"Ca"}, {p:4,g:3,s:"Sc"}, {p:4,g:4,s:"Ti"}, {p:4,g:5,s:"V"}, {p:4,g:6,s:"Cr"}, {p:4,g:7,s:"Mn"}, {p:4,g:8,s:"Fe"}, {p:4,g:9,s:"Co"}, {p:4,g:10,s:"Ni"}, {p:4,g:11,s:"Cu"}, {p:4,g:12,s:"Zn"}, {p:4,g:13,s:"Ga"}, {p:4,g:14,s:"Ge"}, {p:4,g:15,s:"As"}, {p:4,g:16,s:"Se"}, {p:4,g:17,s:"Br"}, {p:4,g:18,s:"Kr"},
  {p:5,g:1,s:"Rb"}, {p:5,g:2,s:"Sr"}, {p:5,g:3,s:"Y"}, {p:5,g:4,s:"Zr"}, {p:5,g:5,s:"Nb"}, {p:5,g:6,s:"Mo"}, {p:5,g:7,s:"Tc"}, {p:5,g:8,s:"Ru"}, {p:5,g:9,s:"Rh"}, {p:5,g:10,s:"Pd"}, {p:5,g:11,s:"Ag"}, {p:5,g:12,s:"Cd"}, {p:5,g:13,s:"In"}, {p:5,g:14,s:"Sn"}, {p:5,g:15,s:"Sb"}, {p:5,g:16,s:"Te"}, {p:5,g:17,s:"I"}, {p:5,g:18,s:"Xe"},
  {p:6,g:1,s:"Cs"}, {p:6,g:2,s:"Ba"}, {p:6,g:3,s:"La"},
  {p:6,g:4,s:"Hf"}, {p:6,g:5,s:"Ta"}, {p:6,g:6,s:"W"}, {p:6,g:7,s:"Re"}, {p:6,g:8,s:"Os"}, {p:6,g:9,s:"Ir"}, {p:6,g:10,s:"Pt"}, {p:6,g:11,s:"Au"}, {p:6,g:12,s:"Hg"},
  {p:6,g:13,s:"Tl"}, {p:6,g:14,s:"Pb"}, {p:6,g:15,s:"Bi"}, {p:6,g:16,s:"Po"}, {p:6,g:17,s:"At"}, {p:6,g:18,s:"Rn"},
  {p:7,g:1,s:"Fr"}, {p:7,g:2,s:"Ra"}, {p:7,g:3,s:"Ac"},
  {p:7,g:4,s:"Rf"}, {p:7,g:5,s:"Db"}, {p:7,g:6,s:"Sg"}, {p:7,g:7,s:"Bh"}, {p:7,g:8,s:"Hs"}, {p:7,g:9,s:"Mt"}, {p:7,g:10,s:"Ds"}, {p:7,g:11,s:"Rg"}, {p:7,g:12,s:"Cn"},
  {p:7,g:13,s:"Nh"}, {p:7,g:14,s:"Fl"}, {p:7,g:15,s:"Mc"}, {p:7,g:16,s:"Lv"}, {p:7,g:17,s:"Ts"}, {p:7,g:18,s:"Og"},
];

const LANTHANIDES = ["Ce","Pr","Nd","Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu"]; // La in main
const ACTINIDES   = ["Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm","Md","No","Lr"]; // Ac in main

function crsClassFromRow(row){
  // Only color if CRS is a real number and not placeholder/insufficient
  const st = normStatus(row);
  if (st === "insufficient") return "";

  const v = toNum(row?.CRS, NaN);
  if (!Number.isFinite(v)) return ""; // unknown
  const c = Math.max(0, Math.min(3, Math.round(v)));
  return `crs-${c}`;
}

function renderPeriodicTable(){
  const container = document.getElementById("ptable");
  if (!container) return;

  container.innerHTML = "";

  const pos = new Map();
  for (const it of MAIN_LAYOUT) pos.set(`${it.p},${it.g}`, it.s);

  for (let p = 1; p <= 7; p++){
    for (let g = 1; g <= 18; g++){
      const sym = pos.get(`${p},${g}`);
      if (!sym){
        const empty = document.createElement("div");
        empty.className = "pt-empty";
        container.appendChild(empty);
        continue;
      }
      container.appendChild(makeElementCell(sym));
    }
  }

  const addFRow = (symbols) => {
    for (let i=0;i<3;i++){
      const empty = document.createElement("div");
      empty.className = "pt-empty";
      container.appendChild(empty);
    }
    for (const sym of symbols){
      container.appendChild(makeElementCell(sym));
    }
    const empty = document.createElement("div");
    empty.className = "pt-empty";
    container.appendChild(empty);
  };

  addFRow(LANTHANIDES);
  addFRow(ACTINIDES);

  if (activeSymbol){
    const el = container.querySelector(`[data-symbol="${activeSymbol}"]`);
    if (el) el.classList.add("active");
  }
}

function makeElementCell(symbol){
  const e = E_BY_SYMBOL.get(symbol);
  const row = pcptBySymbol.get(symbol);
  const crsCls = crsClassFromRow(row);

  const cell = document.createElement("div");
  cell.className = `pt-cell ${crsCls}`.trim();
  cell.dataset.symbol = symbol;

  const z = document.createElement("div");
  z.className = "pt-num";
  z.textContent = e?.Z ?? "";

  const sym = document.createElement("div");
  sym.className = "pt-sym";
  sym.textContent = symbol;

  const name = document.createElement("div");
  name.className = "pt-name";
  name.textContent = e?.n ?? "";

  cell.appendChild(z);
  cell.appendChild(sym);
  cell.appendChild(name);

  cell.addEventListener("click", () => onSelectElement(symbol));
  return cell;
}

function setInputValue(id, value){
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(value);
}

function onSelectElement(symbol){
  activeSymbol = symbol;

  const container = document.getElementById("ptable");
  if (container){
    container.querySelectorAll(".pt-cell.active").forEach(x => x.classList.remove("active"));
    const active = container.querySelector(`[data-symbol="${symbol}"]`);
    if (active) active.classList.add("active");
  }

  const row = pcptBySymbol.get(symbol);
  const e = E_BY_SYMBOL.get(symbol);

  const details = document.getElementById("elementDetails");
  const title = document.getElementById("detailsTitle");
  const body = document.getElementById("detailsBody");

  if (details && title && body){
    details.style.display = "block";
    title.textContent = `${symbol}${e?.n ? " — " + e.n : ""} ${e?.Z ? `(Z=${e.Z})` : ""}`;

    if (!row){
      body.innerHTML = `<p class="small">No PCPT entry for <b>${escapeHTML(symbol)}</b> in <code>data/pcpt.csv</code>.</p>`;
    } else {
      const rr = uiRow(row);
      const st = normStatus(rr) || (isPlaceholderPCPT(rr) ? "insufficient" : "");
      const CRS = rr.CRS ?? "—";
      const DMC = rr.DMC ?? "—";
      const note = rr.note ?? "";
      const reason = rr.reason ?? "";

      const statusLabel =
        st === "high" ? "Calculated (high confidence)" :
        st === "low" ? "Calculated (low confidence)" :
        st === "insufficient" ? "Insufficient NIST data / unclassified" :
        "—";

      body.innerHTML = `
        <div><span class="tag">Status</span> <b>${escapeHTML(statusLabel)}</b></div>
        <div style="margin-top:6px"><span class="tag">CRS</span> <b>${escapeHTML(CRS)}</b></div>
        <div style="margin-top:6px"><span class="tag">DMC</span> ${escapeHTML(DMC)}</div>
        ${reason ? `<div style="margin-top:6px" class="small"><span class="tag">Reason</span> ${escapeHTML(reason)}</div>` : ""}
        <div style="margin-top:6px" class="small">${escapeHTML(note)}</div>
      `;
    }
  }

  const filter = document.getElementById("filter");
  if (filter){
    filter.value = symbol;
    filter.dispatchEvent(new Event("input"));
  }

  // auto-fill calculator ONLY if the row has real numeric fields and is not insufficient
  if (row && !isPlaceholderPCPT(row) && normStatus(row) !== "insufficient"){
    const delta = toNum(row.delta_eV ?? row.delta ?? "", NaN);
    const V     = toNum(row.V_eV ?? row.V ?? "", NaN);
    const dop   = toNum(row.DeltaOp_eV ?? row.dop_eV ?? row.dop ?? row.DeltaOp ?? "", NaN);

    if (Number.isFinite(delta)) setInputValue("delta", delta);
    if (Number.isFinite(V))     setInputValue("V", V);
    if (Number.isFinite(dop))   setInputValue("dop", dop);

    renderOut();

    const calc = document.getElementById("calculator");
    if (calc) calc.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

// ------------------------------------------------------
// Initial load
// ------------------------------------------------------

(async ()=>{
  try{
    await loadPCPT();
    await loadCasesOptional();

    // Re-ensure help panel after everything is on DOM
    ensureCalculatorHelpPanel();
  } catch(e){
    console.warn("Initial CSV load failed:", e.message);
  }
})();

// Service worker registration (relative path is safer on GitHub Pages subpaths)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // keep relative: controls current directory scope
      await navigator.serviceWorker.register("./sw.js");
    } catch(e) {
      console.warn("SW register failed:", e?.message ?? e);
    }
  });
}



