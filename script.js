let ELEV_SPEED = 1.5;
let STOP_TIME = 5;
let BOARD_TIME = 1.5;

let N = 6;
let M = 2;
let CAPACITY = 8;
let SPEED = 2;

let matrix = [];
let waiters = [];
let elevators = [];
let served = 0;
let delivered = 0;
let simHours = 0;
let durations = [];
let maxDur = 0;
let series = [];
let lastSample = 0;
const SAMPLE_H = 0.02;

const $ = (sel) => document.querySelector(sel);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function initMatrix() {
  matrix = [];
  for (let from = 0; from < N; from++) {
    matrix.push(new Array(N).fill(0));
  }
}

function setMatrix(from, to, v) {
  if (from < 0 || from >= N || to < 0 || to >= N) return;
  if (from !== to) matrix[from][to] = v;
}

function buildMatrix() {}

function buildBuilding() {
  const carH = 48;
  const gap = 14;
  const pitch = carH + gap;
  const totalH = N * carH + (N - 1) * gap;
  const root = document.documentElement;
  root.style.setProperty("--fh", carH + "px");
  root.style.setProperty("--gap", gap + "px");
  root.style.setProperty("--pitch", pitch + "px");
  const wrap = $("#building-wrap");
  const panel = $("#floor-panel");
  const shafts = $("#shafts");
  panel.innerHTML = "";
  shafts.innerHTML = "";
  wrap.style.height = `${totalH}px`;

  for (let f = N - 1; f >= 0; f--) {
    const row = document.createElement("div");
    row.className = "frow";
    row.style.height = `${carH}px`;
    row.style.marginBottom = f > 0 ? `${gap}px` : "0";
    const chips = [];
    if (f < N - 1) chips.push(`<span class="fchip up" id="fwup-${f}"></span>`);
    if (f > 0) chips.push(`<span class="fchip down" id="fwdown-${f}"></span>`);
    row.innerHTML = `<span class="flabel">F${f}</span>${chips.join("")}`;
    panel.appendChild(row);
  }

  for (let i = 0; i < M; i++) {
    const col = document.createElement("div");
    col.className = "shaft-col";
    col.style.height = `${totalH}px`;
    const shaft = document.createElement("div");
    shaft.className = "shaft";
    shaft.style.height = `${totalH}px`;
    const car = document.createElement("div");
    car.className = "car";
    car.id = `car-${i}`;
    car.style.height = `${carH}px`;
    car.innerHTML = `<div class="car-hud">
        <span class="car-arrow" id="dir-${i}"></span>
        <span class="car-count" id="count-${i}"></span>
        <div class="car-fill"><div class="car-fill-bar" id="fill-${i}"></div></div>
      </div>`;
    shaft.appendChild(car);
    col.appendChild(shaft);
    const name = document.createElement("div");
    name.className = "shaft-name";
    name.textContent = `E${i + 1}`;
    col.appendChild(name);
    shafts.appendChild(col);
  }
}

function resetSim() {
  waiters = Array.from({ length: N }, () => []);
  elevators = [];
  for (let i = 0; i < M; i++) {
    elevators.push({ pos: 0, dir: 1, cabin: [], stopPhase: null, stopTimer: 0, leaving: [], entering: [] });
  }
  served = 0;
  delivered = 0;
  simHours = 0;
  durations = [];
  maxDur = 0;
  series = [];
  lastSample = 0;
}

function shouldStop(e, f) {
  if (e.cabin.some((p) => p.target === f)) return true;
  if (e.cabin.length >= CAPACITY) return false;
  return waiters[f].some((p) => (p.target - f) * e.dir > 0);
}

function stopAt(e, f) {
  e.pos = f;
  e.leaving = e.cabin.filter((p) => p.target === f);
  const room = CAPACITY - (e.cabin.length - e.leaving.length);
  e.entering = [];
  for (const p of waiters[f]) {
    if (e.entering.length < room && (p.target - f) * e.dir > 0) {
      e.entering.push(p);
    }
  }
  const enteringSet = new Set(e.entering);
  waiters[f] = waiters[f].filter((p) => !enteringSet.has(p));
  e.stopPhase = "open";
  e.stopTimer = STOP_TIME / 2;
}

function advanceStop(e, simDt) {
  e.stopTimer -= simDt;
  if (e.stopTimer > 0) return;
  if (e.stopPhase === "open") {
    if (e.leaving.length > 0) {
      e.stopPhase = "leave";
      e.stopTimer = BOARD_TIME;
    } else if (e.entering.length > 0) {
      e.stopPhase = "enter";
      e.stopTimer = BOARD_TIME;
    } else {
      e.stopPhase = "close";
      e.stopTimer = STOP_TIME / 2;
    }
  } else if (e.stopPhase === "leave") {
    const p = e.leaving.pop();
    e.cabin = e.cabin.filter((x) => x !== p);
    delivered++;
    const dur = simHours - p.arrived;
    durations.push(dur);
    if (dur > maxDur) maxDur = dur;
    if (e.leaving.length > 0) {
      e.stopTimer = BOARD_TIME;
    } else if (e.entering.length > 0) {
      e.stopPhase = "enter";
      e.stopTimer = BOARD_TIME;
    } else {
      e.stopPhase = "close";
      e.stopTimer = STOP_TIME / 2;
    }
  } else if (e.stopPhase === "enter") {
    e.cabin.push(e.entering.pop());
    if (e.entering.length > 0) {
      e.stopTimer = BOARD_TIME;
    } else {
      e.stopPhase = "close";
      e.stopTimer = STOP_TIME / 2;
    }
  } else if (e.stopPhase === "close") {
    e.stopPhase = null;
    e.stopTimer = 0;
  }
}

const MAX_MOVE = 0.5;

function step(realDt) {
  const h = Math.min(0.1, MAX_MOVE / ELEV_SPEED);
  let remaining = realDt * SPEED;
  while (remaining > 1e-9) {
    const d = Math.min(h, remaining);
    stepOnce(d);
    remaining -= d;
  }
  simHours += (realDt * SPEED) / 3600;
}

function stepOnce(simDt) {
  for (let from = 0; from < N; from++) {
    for (let to = 0; to < N; to++) {
      if (from === to) continue;
      const expected = matrix[from][to] * (1 / 3600) * simDt;
      const p = expected - Math.floor(expected);
      const r = Math.random();
      let n = Math.floor(expected);
      if (r < p) n += 1;
      for (let k = 0; k < n; k++) waiters[from].push({ target: to, arrived: simHours });
    }
  }

  const totalWaiting = waiters.reduce((a, q) => a + q.length, 0);
  for (const e of elevators) {
    if (e.stopPhase !== null) {
      advanceStop(e, simDt);
      continue;
    }
    if (totalWaiting === 0 && e.cabin.length === 0) {
      if (e.pos !== Math.round(e.pos)) {
        const target = e.dir > 0 ? Math.ceil(e.pos) : Math.floor(e.pos);
        e.pos += e.dir * ELEV_SPEED * simDt;
        if (e.dir > 0) e.pos = Math.min(e.pos, target);
        else e.pos = Math.max(e.pos, target);
      }
      continue;
    }
    const prevPos = e.pos;
    e.pos += e.dir * ELEV_SPEED * simDt;
    if (e.pos >= N - 1) {
      e.pos = N - 1;
      e.dir = -1;
    } else if (e.pos <= 0) {
      e.pos = 0;
      e.dir = 1;
    }
    let arrival = arrivedAt(prevPos, e.pos, e.dir);
    if (arrival == null) {
      if (prevPos < N - 1 && e.pos >= N - 1) arrival = N - 1;
      else if (prevPos > 0 && e.pos <= 0) arrival = 0;
    }
    if (arrival != null && shouldStop(e, arrival)) {
      stopAt(e, arrival);
    }
  }
}

function arrivedAt(prevPos, pos, dir) {
  if (dir > 0) {
    const f = Math.floor(prevPos) + 1;
    if (f < N && pos >= f) return f;
  } else {
    const f = Math.ceil(prevPos) - 1;
    if (f >= 0 && pos <= f) return f;
  }
  return null;
}

function render() {
  const pitch = 48 + 14;
  for (let i = 0; i < M; i++) {
    const e = elevators[i];
    const car = $(`#car-${i}`);
    car.style.bottom = `${e.pos * pitch}px`;
    car.classList.toggle("car-idle", e.stopPhase === null && e.cabin.length === 0 && waiters.reduce((a, q) => a + q.length, 0) === 0);
    const arrow = $(`#dir-${i}`);
    arrow.textContent = e.dir > 0 ? "\u25b2" : "\u25bc";
    arrow.className = `car-arrow ${e.dir > 0 ? "up" : "down"}`;
    $(`#count-${i}`).textContent = `${e.cabin.length}/${CAPACITY}`;
    const fill = $(`#fill-${i}`);
    fill.style.width = `${(e.cabin.length / CAPACITY) * 100}%`;
    fill.classList.toggle("full", e.cabin.length >= CAPACITY);
  }
  for (let f = 0; f < N; f++) {
    const up = waiters[f].filter((p) => p.target > f).length;
    const down = waiters[f].filter((p) => p.target < f).length;
    const upEl = $(`#fwup-${f}`);
    const downEl = $(`#fwdown-${f}`);
    if (upEl) {
      upEl.textContent = `\u25b2 ${up}`;
      upEl.classList.toggle("has", up > 0);
    }
    if (downEl) {
      downEl.textContent = `\u25bc ${down}`;
      downEl.classList.toggle("has", down > 0);
    }
  }
  const maxWait = waiters.reduce(
    (a, q) => q.reduce((m, p) => Math.max(m, simHours - p.arrived), a),
    0
  );
  $("#statTime").textContent = simHours.toFixed(2);
  $("#statWaiting").textContent = waiters.reduce((a, q) => a + q.length, 0);
  $("#statServed").textContent = delivered;
  $("#statMaxWait").textContent = maxWait.toFixed(2);
  $("#statTrips").textContent = durations.length;
  if (simHours - lastSample >= SAMPLE_H) {
    series.push({ t: simHours, max: maxDur });
    lastSample = simHours;
  }
  drawHist();
  drawLine();
}

const CHART = {
  bg: "rgba(255,255,255,0)",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.25)",
  text: "#b3b3b3",
  label: "#777777",
  histFill: "#4a4a4a",
  histFillTop: "#8a8a8a",
  line: "#f0b429",
  areaTop: "rgba(240,180,41,0.18)",
  areaBot: "rgba(240,180,41,0)",
};

function roundRect(ctx, x, y, w, h, r) {
  if (h < 1) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function niceTicks(max, n) {
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  if (ticks.length > 8) ticks.push(max);
  return { ticks, step };
}

function drawGrid(ctx, W, H, padL, padB, padT, padR, xticks, yticks) {
  ctx.strokeStyle = CHART.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < xticks; i++) {
    const x = padL + ((i + 0) / (xticks - 1)) * (W - padL - padR);
    ctx.moveTo(x, padT);
    ctx.lineTo(x, H - padB);
  }
  for (let i = 0; i < yticks; i++) {
    const y = H - padB - (i / (yticks - 1)) * (H - padT - padB);
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
  }
  ctx.stroke();
}

function drawAxes(ctx, W, H, padL, padB, padT, padR) {
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();
}

function drawHist() {
  const c = $("#hist");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);

  const padL = 52;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (durations.length === 0) {
    ctx.fillStyle = CHART.text;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("no completed trips yet", W / 2, H / 2);
    return;
  }

  const bins = 24;
  const upper = Math.max(...durations) * 1.02 || 1;
  const counts = new Array(bins).fill(0);
  for (const d of durations) {
    let b = Math.floor((d / upper) * bins);
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const maxCount = Math.max(...counts);

  const yT = niceTicks(maxCount, 4);
  const yTicks = Math.min(6, yT.ticks.length);
  const xTicks = 6;
  drawGrid(ctx, W, H, padL, padB, padT, padR, xTicks, yTicks);

  const bw = plotW / bins;
  for (let b = 0; b < bins; b++) {
    const h = (counts[b] / maxCount) * plotH;
    if (h < 1) continue;
    const x = padL + b * bw;
    const y = H - padB - h;
    const grad = ctx.createLinearGradient(0, y, 0, H - padB);
    grad.addColorStop(0, CHART.histFillTop);
    grad.addColorStop(1, CHART.histFill);
    ctx.fillStyle = grad;
    roundRect(ctx, x + 1, y, bw - 2, h, 3);
    ctx.fill();
  }

  drawAxes(ctx, W, H, padL, padB, padT, padR);
  ctx.fillStyle = CHART.text;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  yT.ticks.slice(0, yTicks).forEach((v, i) => {
    const y = H - padB - (i / (yTicks - 1)) * plotH;
    ctx.fillText(v, padL - 6, y + 3);
  });
  ctx.fillStyle = CHART.label;
  ctx.textAlign = "left";
  ctx.font = "11px system-ui";
  ctx.fillText("trips", 4, padT);
  ctx.textAlign = "center";
  ctx.fillStyle = CHART.text;
  for (let i = 0; i < xTicks; i++) {
    const v = (upper * (i / (xTicks - 1))).toFixed(2);
    const x = padL + (i / (xTicks - 1)) * plotW;
    ctx.fillText(v, x, H - 12);
  }
  ctx.fillStyle = CHART.label;
  ctx.fillText("duration (h)", padL + plotW / 2, H - 4);
}

function drawLine() {
  const c = $("#line");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);

  const padL = 52;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (series.length < 2) {
    ctx.fillStyle = CHART.text;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("not enough data yet", W / 2, H / 2);
    return;
  }

  const tMax = series[series.length - 1].t || 1;
  const yMax = Math.max(...series.map((s) => s.max)) * 1.02 || 1;
  const yT = niceTicks(yMax, 4);
  const yTicks = Math.min(6, yT.ticks.length);
  const xTicks = 6;
  drawGrid(ctx, W, H, padL, padB, padT, padR, xTicks, yTicks);

  const pts = series.map((s) => ({
    x: padL + (s.t / tMax) * plotW,
    y: H - padB - (s.max / yMax) * plotH,
  }));

  const area = ctx.createLinearGradient(0, padT, 0, H - padB);
  area.addColorStop(0, CHART.areaTop);
  area.addColorStop(1, CHART.areaBot);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineTo(pts[pts.length - 1].x, H - padB);
  ctx.lineTo(pts[0].x, H - padB);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = CHART.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.fillStyle = CHART.line;
  ctx.beginPath();
  ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 3, 0, Math.PI * 2);
  ctx.fill();

  drawAxes(ctx, W, H, padL, padB, padT, padR);
  ctx.fillStyle = CHART.text;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  yT.ticks.slice(0, yTicks).forEach((v, i) => {
    const y = H - padB - (i / (yTicks - 1)) * plotH;
    ctx.fillText(v.toFixed(2), padL - 6, y + 3);
  });
  ctx.fillStyle = CHART.label;
  ctx.textAlign = "left";
  ctx.fillText("max wait (h)", 4, padT);
  ctx.textAlign = "center";
  ctx.fillStyle = CHART.text;
  for (let i = 0; i < xTicks; i++) {
    const v = (tMax * (i / (xTicks - 1))).toFixed(2);
    const x = padL + (i / (xTicks - 1)) * plotW;
    ctx.fillText(v, x, H - 12);
  }
  ctx.fillStyle = CHART.label;
  ctx.fillText("time (h)", padL + plotW / 2, H - 4);
}

let running = false;
let last = null;

function frame(ts) {
  if (last == null) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  dt = Math.min(dt, 0.1);
  if (running) {
    step(dt);
    render();
  }
  requestAnimationFrame(frame);
}

function applyConfig() {
  const newN = clamp(Math.round(+$("#n").value) || 6, 2, 20);
  const newM = clamp(Math.round(+$("#m").value) || 2, 1, 8);
  const newCap = clamp(Math.round(+$("#cap").value) || 8, 1, 30);
  if (newN !== N || newM !== M || newCap !== CAPACITY) {
    N = newN;
    M = newM;
    CAPACITY = newCap;
    initMatrix();
    $("#scenarioStory").max = N - 1;
    if (+$("#scenarioStory").value > N - 1) $("#scenarioStory").value = 0;
    buildBuilding();
    resetSim();
    saveState();
  }
}

["n", "m", "cap"].forEach((id) => {
  $("#" + id).addEventListener("input", applyConfig);
  $("#" + id).addEventListener("change", applyConfig);
});

$("#elevSpeed").addEventListener("input", () => {
  ELEV_SPEED = clamp(+$("#elevSpeed").value || 1.5, 0.1, 20);
  saveState();
});
$("#stopTime").addEventListener("input", () => {
  STOP_TIME = clamp(+$("#stopTime").value || 0, 0, 10);
  saveState();
});
$("#boardTime").addEventListener("input", () => {
  BOARD_TIME = clamp(+$("#boardTime").value || 0, 0, 5);
  saveState();
});

document.addEventListener(
  "wheel",
  (e) => {
    const inp = e.target.closest("input[type=number]");
    if (!inp || inp.disabled) return;
    e.preventDefault();
    const step = +(inp.step || 1);
    const dir = e.deltaY < 0 ? 1 : -1;
    inp.value = +inp.value + dir * step;
    inp.dispatchEvent(new Event("input"));
    inp.dispatchEvent(new Event("change"));
  },
  { passive: false }
);

function applyScenario(from, to) {
  const story = clamp(Math.round(+$("#scenarioStory").value) || 0, 0, N - 1);
  const people = Math.max(0, +$("#scenarioPeople").value || 0);
  const base = Math.round(people * 0.01);
  initMatrix();
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      if (a === b) continue;
      const hot = from === -1 ? b === story : a === story;
      setMatrix(a, b, hot ? people : base);
    }
  }
  resetSim();
  saveState();
}

$("#scenario1toN").addEventListener("click", () => {
  applyScenario(0, -1);
});

$("#scenarioNto1").addEventListener("click", () => {
  applyScenario(-1, 0);
});

$("#toggle").addEventListener("click", () => {
  running = !running;
  $("#toggle").textContent = running ? "Pause" : "Start";
  last = null;
});

$("#reset").addEventListener("click", () => {
  resetSim();
});

const STORAGE_KEY = "elevator-sim";

function saveState() {
  try {
    const state = {
      N, M, CAPACITY, SPEED, ELEV_SPEED, STOP_TIME, BOARD_TIME, matrix,
      scenarioStory: +$("#scenarioStory").value,
      scenarioPeople: +$("#scenarioPeople").value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    N = clamp(Math.round(+s.N) || 6, 2, 20);
    M = clamp(Math.round(+s.M) || 2, 1, 8);
    CAPACITY = clamp(Math.round(+s.CAPACITY) || 8, 1, 30);
    SPEED = Math.max(1, +s.SPEED || 1);
    ELEV_SPEED = clamp(+s.ELEV_SPEED || 1.5, 0.1, 20);
    STOP_TIME = clamp(+s.STOP_TIME ?? 5, 0, 10);
    BOARD_TIME = clamp(+s.BOARD_TIME ?? 1.5, 0, 5);
    if (Array.isArray(s.matrix) && s.matrix.length === N) {
      matrix = s.matrix.map((row) => row.slice());
    }
    if (s.scenarioStory !== undefined) $("#scenarioStory").value = s.scenarioStory;
    if (s.scenarioPeople !== undefined) $("#scenarioPeople").value = s.scenarioPeople;
    $("#n").value = N;
    $("#m").value = M;
    $("#cap").value = CAPACITY;
    $("#speed").value = SPEED;
    $("#elevSpeed").value = ELEV_SPEED;
    $("#stopTime").value = STOP_TIME;
    $("#boardTime").value = BOARD_TIME;
    return true;
  } catch (e) {
    return false;
  }
}

$("#speed").addEventListener("input", () => {
  SPEED = Math.max(1, +$("#speed").value || 1);
  saveState();
});

const loaded = loadState();
if (matrix.length === 0) {
  initMatrix();
  applyScenario(0, -1);
}
buildBuilding();
resetSim();
$("#toggle").textContent = "Start";
requestAnimationFrame(frame);
