const ELEV_SPEED = 2;
const DOOR_TIME = 0.8;

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

function buildMatrix() {
  const table = $("#matrix");
  table.innerHTML = "";
  matrix = [];
  const head = document.createElement("tr");
  head.appendChild(document.createElement("th"));
  for (let to = 0; to < N; to++) {
    const th = document.createElement("th");
    th.textContent = `to ${to}`;
    head.appendChild(th);
  }
  table.appendChild(head);
  for (let from = 0; from < N; from++) {
    matrix.push(new Array(N).fill(0));
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = `from ${from}`;
    tr.appendChild(th);
    for (let to = 0; to < N; to++) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = 0;
      input.value = 0;
      input.dataset.from = from;
      input.dataset.to = to;
      if (from === to) {
        input.disabled = true;
        input.value = "";
        td.classList.add("diag");
      } else {
        input.value = 30;
        matrix[from][to] = 30;
      }
      td.appendChild(input);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

function readMatrix() {
  document.querySelectorAll("#matrix input:not(:disabled)").forEach((inp) => {
    const from = +inp.dataset.from;
    const to = +inp.dataset.to;
    matrix[from][to] = Math.max(0, +inp.value || 0);
  });
}

function buildBuilding() {
  const floorH = 60;
  const wrap = $("#building-wrap");
  const panel = $("#floor-panel");
  const shafts = $("#shafts");
  panel.innerHTML = "";
  shafts.innerHTML = "";
  wrap.style.height = `${N * floorH}px`;

  for (let f = N - 1; f >= 0; f--) {
    const row = document.createElement("div");
    row.className = "frow";
    row.style.height = `${floorH}px`;
    row.innerHTML = `<span class="flabel">${f}</span><span class="fwait" id="fwait-${f}"></span>`;
    panel.appendChild(row);
  }

  for (let i = 0; i < M; i++) {
    const col = document.createElement("div");
    col.className = "shaft-col";
    col.style.height = `${N * floorH}px`;
    const shaft = document.createElement("div");
    shaft.className = "shaft";
    shaft.style.height = `${N * floorH}px`;
    const car = document.createElement("div");
    car.className = "car";
    car.id = `car-${i}`;
    car.style.height = `${floorH * 0.7}px`;
    car.innerHTML = `<div class="badge"><span id="dir-${i}"></span><span id="count-${i}"></span></div>`;
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
    elevators.push({ pos: 0, dir: 1, cabin: [], stopTimer: 0 });
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

function processStop(e, f) {
  const leaving = e.cabin.filter((p) => p.target === f);
  e.cabin = e.cabin.filter((p) => p.target !== f);
  delivered += leaving.length;
  for (const p of leaving) {
    const dur = simHours - p.arrived;
    durations.push(dur);
    if (dur > maxDur) maxDur = dur;
  }
  const room = CAPACITY - e.cabin.length;
  const take = [];
  for (let i = waiters[f].length - 1; i >= 0 && take.length < room; i--) {
    const p = waiters[f][i];
    if ((p.target - f) * e.dir > 0) {
      take.push(p);
      waiters[f].splice(i, 1);
    }
  }
  e.cabin.push(...take);
}

function stopAt(e, f) {
  e.pos = f;
  e.stopTimer = DOOR_TIME;
  processStop(e, f);
}

const SIM_H = 0.02;

function step(realDt) {
  let remaining = realDt * SPEED;
  while (remaining > 1e-9) {
    const d = Math.min(SIM_H, remaining);
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

  for (const e of elevators) {
    if (e.stopTimer > 0) {
      e.stopTimer -= simDt;
      processStop(e, Math.round(e.pos));
      if (e.stopTimer <= 0) e.stopTimer = 0;
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
  const floorH = 60;
  for (let i = 0; i < M; i++) {
    const e = elevators[i];
    const car = $(`#car-${i}`);
    car.style.bottom = `${e.pos * floorH}px`;
    $(`#dir-${i}`).textContent = e.dir > 0 ? "\u25b2" : "\u25bc";
    $(`#count-${i}`).textContent = `${e.cabin.length}/${CAPACITY}`;
  }
  for (let f = 0; f < N; f++) {
    const up = waiters[f].filter((p) => p.target > f).length;
    const down = waiters[f].filter((p) => p.target < f).length;
    const el = $(`#fwait-${f}`);
    if (el) el.textContent = `${up} \u25b2  \u25bc ${down}`;
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

function drawHist() {
  const c = $("#hist");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#333";
  ctx.font = "12px system-ui";
  ctx.fillText("waiting times (histogram)", 10, 16);
  if (durations.length === 0) {
    ctx.fillStyle = "#999";
    ctx.fillText("no completed trips yet", 10, 40);
    return;
  }
  const bins = 24;
  const upper = Math.max(...durations) * 1.05;
  const counts = new Array(bins).fill(0);
  for (const d of durations) {
    let b = Math.floor((d / upper) * bins);
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const maxCount = Math.max(...counts);
  const padL = 46;
  const padB = 22;
  const padT = 26;
  const plotW = W - padL - 10;
  const plotH = H - padT - padB;
  ctx.strokeStyle = "#999";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - 10, H - padB);
  ctx.stroke();
  ctx.fillStyle = "#4a78b8";
  const bw = plotW / bins;
  for (let b = 0; b < bins; b++) {
    const h = (counts[b] / maxCount) * plotH;
    ctx.fillRect(padL + b * bw + 0.5, H - padB - h, bw - 1, h);
  }
  ctx.fillStyle = "#333";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = (upper * (i / 4)).toFixed(2);
    const y = H - padB - (i / 4) * plotH;
    ctx.fillText(val, padL - 4, y + 3);
  }
  ctx.textAlign = "center";
  ctx.fillText("duration (h)", W / 2, H - 6);
}

function drawLine() {
  const c = $("#line");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#333";
  ctx.font = "12px system-ui";
  ctx.fillText("max duration over time", 10, 16);
  if (series.length < 2) {
    ctx.fillStyle = "#999";
    ctx.fillText("not enough data yet", 10, 40);
    return;
  }
  const padL = 46;
  const padB = 22;
  const padT = 26;
  const plotW = W - padL - 10;
  const plotH = H - padT - padB;
  const tMax = series[series.length - 1].t;
  const yMax = Math.max(...series.map((s) => s.max)) * 1.05;
  ctx.strokeStyle = "#999";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - 10, H - padB);
  ctx.stroke();
  ctx.strokeStyle = "#d04848";
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((s, i) => {
    const x = padL + (s.t / tMax) * plotW;
    const y = H - padB - (s.max / yMax) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#333";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = (yMax * (i / 4)).toFixed(2);
    const y = H - padB - (i / 4) * plotH;
    ctx.fillText(val, padL - 4, y + 3);
  }
  ctx.textAlign = "center";
  ctx.fillText("time (h)", W / 2, H - 6);
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
    buildMatrix();
    buildBuilding();
    resetSim();
  }
}

["n", "m", "cap"].forEach((id) => {
  $("#" + id).addEventListener("input", applyConfig);
  $("#" + id).addEventListener("change", applyConfig);
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

document.addEventListener(
  "input",
  (e) => {
    if (e.target.matches && e.target.matches("#matrix input:not(:disabled)")) {
      readMatrix();
    }
  },
  { passive: true }
);

$("#randomize").addEventListener("click", () => {
  readMatrix();
  document.querySelectorAll("#matrix input:not(:disabled)").forEach((inp) => {
    inp.value = Math.floor(Math.random() * 200);
    matrix[+inp.dataset.from][+inp.dataset.to] = +inp.value;
  });
});

$("#toggle").addEventListener("click", () => {
  running = !running;
  $("#toggle").textContent = running ? "Pause" : "Start";
  last = null;
});

$("#reset").addEventListener("click", () => {
  resetSim();
});

$("#speed").addEventListener("input", () => {
  SPEED = clamp(+$("#speed").value || 1, 1, 120);
  $("#speed").value = SPEED;
});

buildMatrix();
buildBuilding();
resetSim();
$("#toggle").textContent = "Start";
requestAnimationFrame(frame);
