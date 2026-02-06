// Pocket Corridor Table starter (robust) + clickable periodic table
// ---------------------------------------------------------------

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

  const Rtxt = (R === Infinity) ? "∞" : fmt(R, 3);
  const sinTxt = fmt(sin2phi, 3);
  const mixTxt = Number.isFinite(DeltaMix) ? `${fmt(DeltaMix,3)} eV` : "NaN";

  out.innerHTML = `
    <div>
      <span class="tag">R</span> ${Rtxt} &nbsp; | &nbsp;
      <span class="tag">sin²φ</span> ${sinTxt} &nbsp; | &nbsp;
      <span class="tag">Δmix</span> ${mixTxt}
    </div>
    <div style="margin-top:6px">
      <span class="tag">CRS</span> <b>${CRS}</b> &nbsp; | &nbsp;
      <span class="tag">kBT</span> ${fmt(kBT,4)} eV (T=${T}K)
    </div>
  `;
}

// Wire calculator
document.getElementById("calc")?.addEventListener("click", renderOut);
renderOut();

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

function renderTable(containerId, headers, rows){
  const el = document.getElementById(containerId);
  if(!el) return;

  if(!rows.length){
    el.innerHTML = "<p class='small'>No data.</p>";
    return;
  }

  const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    rows.map(r=>`<tr>${headers.map(h=>`<td>${(r[h] ?? "")}</td>`).join("")}</tr>`).join("")
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
    (r.note || "").toLowerCase().includes(q)
  ) : rows;

  renderTable("pcptTable", headers, filtered);

  // After PCPT loads, (re)render periodic table (if container exists)
  renderPeriodicTable();
}

async function loadCasesOptional(){
  // OPTIONAL: if data/cases.csv does not exist, do not break the app
  try{
    const t = await fetchText("data/cases.csv");
    const { headers, rows } = parseCSV(t);

    const augHeaders = headers.concat(["R","sin2phi","DeltaMix","CRS_auto"]);
    const augRows = rows.map(r=>{
      const delta = toNum(r.delta_eV, NaN);
      const V = toNum(r.V_eV, NaN);
      const dop = toNum(r.DeltaOp_eV, NaN);

      const { R, sin2phi, DeltaMix } = calc2x2(delta, V);

      return {
        ...r,
        R: (R === Infinity) ? "∞" : fmt(R,3),
        sin2phi: fmt(sin2phi,3),
        DeltaMix: Number.isFinite(DeltaMix) ? fmt(DeltaMix,3) : "NaN",
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
    (r.note || "").toLowerCase().includes(q)
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
 * No external deps. Enough for a clean UI.
 */
const ELEMENTS = [
  // 1..10
  {Z:1,s:"H",n:"Hydrogen"}, {Z:2,s:"He",n:"Helium"},
  {Z:3,s:"Li",n:"Lithium"}, {Z:4,s:"Be",n:"Beryllium"},
  {Z:5,s:"B",n:"Boron"}, {Z:6,s:"C",n:"Carbon"},
  {Z:7,s:"N",n:"Nitrogen"}, {Z:8,s:"O",n:"Oxygen"},
  {Z:9,s:"F",n:"Fluorine"}, {Z:10,s:"Ne",n:"Neon"},
  // 11..20
  {Z:11,s:"Na",n:"Sodium"}, {Z:12,s:"Mg",n:"Magnesium"},
  {Z:13,s:"Al",n:"Aluminium"}, {Z:14,s:"Si",n:"Silicon"},
  {Z:15,s:"P",n:"Phosphorus"}, {Z:16,s:"S",n:"Sulfur"},
  {Z:17,s:"Cl",n:"Chlorine"}, {Z:18,s:"Ar",n:"Argon"},
  {Z:19,s:"K",n:"Potassium"}, {Z:20,s:"Ca",n:"Calcium"},
  // 21..30
  {Z:21,s:"Sc",n:"Scandium"}, {Z:22,s:"Ti",n:"Titanium"},
  {Z:23,s:"V",n:"Vanadium"}, {Z:24,s:"Cr",n:"Chromium"},
  {Z:25,s:"Mn",n:"Manganese"}, {Z:26,s:"Fe",n:"Iron"},
  {Z:27,s:"Co",n:"Cobalt"}, {Z:28,s:"Ni",n:"Nickel"},
  {Z:29,s:"Cu",n:"Copper"}, {Z:30,s:"Zn",n:"Zinc"},
  // 31..40
  {Z:31,s:"Ga",n:"Gallium"}, {Z:32,s:"Ge",n:"Germanium"},
  {Z:33,s:"As",n:"Arsenic"}, {Z:34,s:"Se",n:"Selenium"},
  {Z:35,s:"Br",n:"Bromine"}, {Z:36,s:"Kr",n:"Krypton"},
  {Z:37,s:"Rb",n:"Rubidium"}, {Z:38,s:"Sr",n:"Strontium"},
  {Z:39,s:"Y",n:"Yttrium"}, {Z:40,s:"Zr",n:"Zirconium"},
  // 41..50
  {Z:41,s:"Nb",n:"Niobium"}, {Z:42,s:"Mo",n:"Molybdenum"},
  {Z:43,s:"Tc",n:"Technetium"}, {Z:44,s:"Ru",n:"Ruthenium"},
  {Z:45,s:"Rh",n:"Rhodium"}, {Z:46,s:"Pd",n:"Palladium"},
  {Z:47,s:"Ag",n:"Silver"}, {Z:48,s:"Cd",n:"Cadmium"},
  {Z:49,s:"In",n:"Indium"}, {Z:50,s:"Sn",n:"Tin"},
  // 51..60
  {Z:51,s:"Sb",n:"Antimony"}, {Z:52,s:"Te",n:"Tellurium"},
  {Z:53,s:"I",n:"Iodine"}, {Z:54,s:"Xe",n:"Xenon"},
  {Z:55,s:"Cs",n:"Caesium"}, {Z:56,s:"Ba",n:"Barium"},
  {Z:57,s:"La",n:"Lanthanum"}, {Z:58,s:"Ce",n:"Cerium"},
  {Z:59,s:"Pr",n:"Praseodymium"}, {Z:60,s:"Nd",n:"Neodymium"},
  // 61..70
  {Z:61,s:"Pm",n:"Promethium"}, {Z:62,s:"Sm",n:"Samarium"},
  {Z:63,s:"Eu",n:"Europium"}, {Z:64,s:"Gd",n:"Gadolinium"},
  {Z:65,s:"Tb",n:"Terbium"}, {Z:66,s:"Dy",n:"Dysprosium"},
  {Z:67,s:"Ho",n:"Holmium"}, {Z:68,s:"Er",n:"Erbium"},
  {Z:69,s:"Tm",n:"Thulium"}, {Z:70,s:"Yb",n:"Ytterbium"},
  // 71..80
  {Z:71,s:"Lu",n:"Lutetium"}, {Z:72,s:"Hf",n:"Hafnium"},
  {Z:73,s:"Ta",n:"Tantalum"}, {Z:74,s:"W",n:"Tungsten"},
  {Z:75,s:"Re",n:"Rhenium"}, {Z:76,s:"Os",n:"Osmium"},
  {Z:77,s:"Ir",n:"Iridium"}, {Z:78,s:"Pt",n:"Platinum"},
  {Z:79,s:"Au",n:"Gold"}, {Z:80,s:"Hg",n:"Mercury"},
  // 81..90
  {Z:81,s:"Tl",n:"Thallium"}, {Z:82,s:"Pb",n:"Lead"},
  {Z:83,s:"Bi",n:"Bismuth"}, {Z:84,s:"Po",n:"Polonium"},
  {Z:85,s:"At",n:"Astatine"}, {Z:86,s:"Rn",n:"Radon"},
  {Z:87,s:"Fr",n:"Francium"}, {Z:88,s:"Ra",n:"Radium"},
  {Z:89,s:"Ac",n:"Actinium"}, {Z:90,s:"Th",n:"Thorium"},
  // 91..100
  {Z:91,s:"Pa",n:"Protactinium"}, {Z:92,s:"U",n:"Uranium"},
  {Z:93,s:"Np",n:"Neptunium"}, {Z:94,s:"Pu",n:"Plutonium"},
  {Z:95,s:"Am",n:"Americium"}, {Z:96,s:"Cm",n:"Curium"},
  {Z:97,s:"Bk",n:"Berkelium"}, {Z:98,s:"Cf",n:"Californium"},
  {Z:99,s:"Es",n:"Einsteinium"}, {Z:100,s:"Fm",n:"Fermium"},
  // 101..110
  {Z:101,s:"Md",n:"Mendelevium"}, {Z:102,s:"No",n:"Nobelium"},
  {Z:103,s:"Lr",n:"Lawrencium"}, {Z:104,s:"Rf",n:"Rutherfordium"},
  {Z:105,s:"Db",n:"Dubnium"}, {Z:106,s:"Sg",n:"Seaborgium"},
  {Z:107,s:"Bh",n:"Bohrium"}, {Z:108,s:"Hs",n:"Hassium"},
  {Z:109,s:"Mt",n:"Meitnerium"}, {Z:110,s:"Ds",n:"Darmstadtium"},
  // 111..118
  {Z:111,s:"Rg",n:"Roentgenium"}, {Z:112,s:"Cn",n:"Copernicium"},
  {Z:113,s:"Nh",n:"Nihonium"}, {Z:114,s:"Fl",n:"Flerovium"},
  {Z:115,s:"Mc",n:"Moscovium"}, {Z:116,s:"Lv",n:"Livermorium"},
  {Z:117,s:"Ts",n:"Tennessine"}, {Z:118,s:"Og",n:"Oganesson"},
];

const E_BY_SYMBOL = new Map(ELEMENTS.map(e => [e.s, e]));

/**
 * Layout positions (group/period) using a compact "main table + f-block rows" approach:
 * - Main table: periods 1..7, groups 1..18
 * - f-block: lanthanides (La..Lu) and actinides (Ac..Lr) rendered as separate rows
 */
const MAIN_LAYOUT = [
  // period 1
  {p:1,g:1,s:"H"}, {p:1,g:18,s:"He"},
  // period 2
  {p:2,g:1,s:"Li"}, {p:2,g:2,s:"Be"}, {p:2,g:13,s:"B"}, {p:2,g:14,s:"C"}, {p:2,g:15,s:"N"}, {p:2,g:16,s:"O"}, {p:2,g:17,s:"F"}, {p:2,g:18,s:"Ne"},
  // period 3
  {p:3,g:1,s:"Na"}, {p:3,g:2,s:"Mg"}, {p:3,g:13,s:"Al"}, {p:3,g:14,s:"Si"}, {p:3,g:15,s:"P"}, {p:3,g:16,s:"S"}, {p:3,g:17,s:"Cl"}, {p:3,g:18,s:"Ar"},
  // period 4
  {p:4,g:1,s:"K"}, {p:4,g:2,s:"Ca"}, {p:4,g:3,s:"Sc"}, {p:4,g:4,s:"Ti"}, {p:4,g:5,s:"V"}, {p:4,g:6,s:"Cr"}, {p:4,g:7,s:"Mn"}, {p:4,g:8,s:"Fe"}, {p:4,g:9,s:"Co"}, {p:4,g:10,s:"Ni"}, {p:4,g:11,s:"Cu"}, {p:4,g:12,s:"Zn"}, {p:4,g:13,s:"Ga"}, {p:4,g:14,s:"Ge"}, {p:4,g:15,s:"As"}, {p:4,g:16,s:"Se"}, {p:4,g:17,s:"Br"}, {p:4,g:18,s:"Kr"},
  // period 5
  {p:5,g:1,s:"Rb"}, {p:5,g:2,s:"Sr"}, {p:5,g:3,s:"Y"}, {p:5,g:4,s:"Zr"}, {p:5,g:5,s:"Nb"}, {p:5,g:6,s:"Mo"}, {p:5,g:7,s:"Tc"}, {p:5,g:8,s:"Ru"}, {p:5,g:9,s:"Rh"}, {p:5,g:10,s:"Pd"}, {p:5,g:11,s:"Ag"}, {p:5,g:12,s:"Cd"}, {p:5,g:13,s:"In"}, {p:5,g:14,s:"Sn"}, {p:5,g:15,s:"Sb"}, {p:5,g:16,s:"Te"}, {p:5,g:17,s:"I"}, {p:5,g:18,s:"Xe"},
  // period 6 (La in group 3; f-block shown separately)
  {p:6,g:1,s:"Cs"}, {p:6,g:2,s:"Ba"}, {p:6,g:3,s:"La"},
  {p:6,g:4,s:"Hf"}, {p:6,g:5,s:"Ta"}, {p:6,g:6,s:"W"}, {p:6,g:7,s:"Re"}, {p:6,g:8,s:"Os"}, {p:6,g:9,s:"Ir"}, {p:6,g:10,s:"Pt"}, {p:6,g:11,s:"Au"}, {p:6,g:12,s:"Hg"},
  {p:6,g:13,s:"Tl"}, {p:6,g:14,s:"Pb"}, {p:6,g:15,s:"Bi"}, {p:6,g:16,s:"Po"}, {p:6,g:17,s:"At"}, {p:6,g:18,s:"Rn"},
  // period 7 (Ac in group 3; f-block shown separately)
  {p:7,g:1,s:"Fr"}, {p:7,g:2,s:"Ra"}, {p:7,g:3,s:"Ac"},
  {p:7,g:4,s:"Rf"}, {p:7,g:5,s:"Db"}, {p:7,g:6,s:"Sg"}, {p:7,g:7,s:"Bh"}, {p:7,g:8,s:"Hs"}, {p:7,g:9,s:"Mt"}, {p:7,g:10,s:"Ds"}, {p:7,g:11,s:"Rg"}, {p:7,g:12,s:"Cn"},
  {p:7,g:13,s:"Nh"}, {p:7,g:14,s:"Fl"}, {p:7,g:15,s:"Mc"}, {p:7,g:16,s:"Lv"}, {p:7,g:17,s:"Ts"}, {p:7,g:18,s:"Og"},
];

const LANTHANIDES = ["Ce","Pr","Nd","Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu"]; // La shown in main
const ACTINIDES   = ["Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm","Md","No","Lr"]; // Ac shown in main

function crsClassFromRow(row){
  const v = toNum(row?.CRS, NaN);
  if (!Number.isFinite(v)) return ""; // unknown
  const c = Math.max(0, Math.min(3, Math.round(v)));
  return `crs-${c}`;
}

function renderPeriodicTable(){
  const container = document.getElementById("ptable");
  if (!container) return;

  // Clear
  container.innerHTML = "";

  // Create a map from (p,g) -> symbol
  const pos = new Map();
  for (const it of MAIN_LAYOUT) pos.set(`${it.p},${it.g}`, it.s);

  // Fill 7 periods x 18 groups
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

  // Append f-block rows as two extra 18-col rows (with 3-column indent)
  // We add 18 cells each row: 3 empties + 14 elements + 1 empty to make 18
  // (3 + 14 + 1 = 18)
  const addFRow = (symbols, labelSymbol) => {
    // 3 empties
    for (let i=0;i<3;i++){
      const empty = document.createElement("div");
      empty.className = "pt-empty";
      container.appendChild(empty);
    }

    // optional: the label element (La or Ac) is already in main table, so we don't repeat it
    // 14 elements
    for (const sym of symbols){
      container.appendChild(makeElementCell(sym));
    }

    // last empty
    const empty = document.createElement("div");
    empty.className = "pt-empty";
    container.appendChild(empty);
  };

  addFRow(LANTHANIDES, "La");
  addFRow(ACTINIDES, "Ac");

  // If there is an active selection, re-activate it visually
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

  // Highlight active cell
  const container = document.getElementById("ptable");
  if (container){
    container.querySelectorAll(".pt-cell.active").forEach(x => x.classList.remove("active"));
    const active = container.querySelector(`[data-symbol="${symbol}"]`);
    if (active) active.classList.add("active");
  }

  // Show details
  const row = pcptBySymbol.get(symbol);
  const e = E_BY_SYMBOL.get(symbol);

  const details = document.getElementById("elementDetails");
  const title = document.getElementById("detailsTitle");
  const body = document.getElementById("detailsBody");

  if (details && title && body){
    details.style.display = "block";
    title.textContent = `${symbol}${e?.n ? " — " + e.n : ""} ${e?.Z ? `(Z=${e.Z})` : ""}`;

    if (!row){
      body.innerHTML = `<p class="small">No PCPT entry for <b>${symbol}</b> in <code>data/pcpt.csv</code>.</p>`;
    } else {
      const CRS = row.CRS ?? "";
      const DMC = row.DMC ?? "";
      const note = row.note ?? "";

      body.innerHTML = `
        <div><span class="tag">CRS</span> <b>${CRS}</b></div>
        <div style="margin-top:6px"><span class="tag">DMC</span> ${escapeHTML(DMC)}</div>
        <div style="margin-top:6px" class="small">${escapeHTML(note)}</div>
      `;
    }
  }

  // Filter the PCPT table to the selected symbol (nice UX)
  const filter = document.getElementById("filter");
  if (filter){
    filter.value = symbol;
    filter.dispatchEvent(new Event("input"));
  }

  // OPTIONAL: auto-fill calculator if pcpt.csv provides numeric fields
  // Accepted column names:
  //   delta_eV, V_eV, DeltaOp_eV (or dop_eV)
  if (row){
    const delta = toNum(row.delta_eV ?? row.delta ?? "", NaN);
    const V     = toNum(row.V_eV ?? row.V ?? "", NaN);
    const dop   = toNum(row.DeltaOp_eV ?? row.dop_eV ?? row.dop ?? row.DeltaOp ?? "", NaN);

    // Only overwrite if the csv has actual numbers
    if (Number.isFinite(delta)) setInputValue("delta", delta);
    if (Number.isFinite(V))     setInputValue("V", V);
    if (Number.isFinite(dop))   setInputValue("dop", dop);

    // Recompute output
    renderOut();

    // Scroll gently to calculator (optional)
    const calc = document.getElementById("calculator");
    if (calc) calc.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ------------------------------------------------------
// Initial load
// ------------------------------------------------------

(async ()=>{
  try{
    await loadPCPT();
    await loadCasesOptional();
  } catch(e){
    console.warn("Initial CSV load failed:", e.message);
  }
})();

// Service worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("sw.js"); } catch(e) {}
  });
}
