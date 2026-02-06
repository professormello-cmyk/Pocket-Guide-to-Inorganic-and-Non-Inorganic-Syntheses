// Pocket Corridor Table starter
const kB_eV_per_K = 8.617333262e-5;

function abs(x){ return Math.abs(x); }

function calc2x2(delta, V){
  const denom = Math.sqrt(delta*delta + 4*V*V);
  const R = abs(delta)/abs(V);
  const sin2phi = 0.5*(1 - delta/denom);
  const DeltaMix = denom;
  return {R, sin2phi, DeltaMix};
}

// Simple heuristic classifier (EDIT to match your final paper thresholds)
function classifyCRS(dop, R){
  if (dop >= 0.5 && R >= 5) return 0;
  if (dop >= 0.2 && R >= 2) return 1;
  if (dop >= 0.1 && R >= 1) return 2;
  return 3;
}

function fmt(x, n=4){
  if (!isFinite(x)) return "NaN";
  return Number(x).toFixed(n);
}

function renderOut(){
  const delta = Number(document.getElementById("delta").value);
  const V = Number(document.getElementById("V").value);
  const dop = Number(document.getElementById("dop").value);
  const T = Number(document.getElementById("T").value);

  const {R, sin2phi, DeltaMix} = calc2x2(delta, V);
  const CRS = classifyCRS(dop, R);
  const kBT = kB_eV_per_K * T;
  const out = document.getElementById("out");

  out.innerHTML = `
    <div><span class="tag">R</span> ${fmt(R,3)} &nbsp; | &nbsp;
    <span class="tag">sin²φ</span> ${fmt(sin2phi,3)} &nbsp; | &nbsp;
    <span class="tag">Δmix</span> ${fmt(DeltaMix,3)} eV</div>
    <div style="margin-top:6px"><span class="tag">CRS</span> <b>${CRS}</b> &nbsp; | &nbsp;
    <span class="tag">kBT</span> ${fmt(kBT,4)} eV (T=${T}K)</div>
  `;
}

document.getElementById("calc").addEventListener("click", renderOut);
renderOut();

// CSV loader (no deps)
async function fetchText(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(s=>s.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const parts = lines[i].split(",").map(s=>s.trim());
    const row = {};
    headers.forEach((h,idx)=> row[h]=parts[idx] ?? "");
    rows.push(row);
  }
  return {headers, rows};
}

function renderTable(containerId, headers, rows){
  const el = document.getElementById(containerId);
  if(!rows.length){ el.innerHTML = "<p class='small'>Sem dados.</p>"; return; }
  const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  el.innerHTML = `<table>${thead}${tbody}</table>`;
}

let pcptRaw = [];

async function loadPCPT(){
  const t = await fetchText("data/pcpt.csv");
  const {headers, rows} = parseCSV(t);
  pcptRaw = rows;

  const q = (document.getElementById("filter").value || "").toLowerCase().trim();
  const filtered = q ? rows.filter(r =>
    (r.symbol||"").toLowerCase().includes(q) ||
    (r.DMC||"").toLowerCase().includes(q) ||
    (r.note||"").toLowerCase().includes(q)
  ) : rows;

  renderTable("pcptTable", headers, filtered);
}

async function loadCases(){
  const t = await fetchText("data/cases.csv");
  const {headers, rows} = parseCSV(t);

  const augHeaders = headers.concat(["R","sin2phi","DeltaMix","CRS_auto"]);
  const augRows = rows.map(r=>{
    const delta = Number(r.delta_eV);
    const V = Number(r.V_eV);
    const dop = Number(r.DeltaOp_eV);
    const {R, sin2phi, DeltaMix} = calc2x2(delta, V);
    return {...r,
      R: fmt(R,3),
      sin2phi: fmt(sin2phi,3),
      DeltaMix: fmt(DeltaMix,3),
      CRS_auto: classifyCRS(dop, R)
    };
  });

  renderTable("casesTable", augHeaders, augRows);
}

document.getElementById("reload").addEventListener("click", async ()=>{
  try{ await loadPCPT(); await loadCases(); }
  catch(e){ alert("Erro ao carregar CSV: " + e.message); }
});

document.getElementById("filter").addEventListener("input", ()=>{
  const q = (document.getElementById("filter").value || "").toLowerCase().trim();
  const filtered = q ? pcptRaw.filter(r =>
    (r.symbol||"").toLowerCase().includes(q) ||
    (r.DMC||"").toLowerCase().includes(q) ||
    (r.note||"").toLowerCase().includes(q)
  ) : pcptRaw;
  const headers = pcptRaw.length ? Object.keys(pcptRaw[0]) : [];
  renderTable("pcptTable", headers, filtered);
});

// Service worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("sw.js"); } catch(e) {}
  });
}
