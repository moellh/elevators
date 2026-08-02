const ELEV_SPEED = 2;
const DOOR_TIME = 0.8;

let N = 6;
let M = 2;
let CAPACITY = 8;
let SPEED = 60;

let matrix = [];
let waiters = [];
let elevators = [];
let served = 0;
let delivered = 0;
let simHours = 0;

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
}

function shouldStop(e, f) {
  if (e.cabin.includes(f)) return true;
  if (e.cabin.length >= CAPACITY) return false;
  return waiters[f].some((t) => (t - f) * e.dir > 0);
}

function processStop(e, f) {
  const before = e.cabin.length;
  e.cabin = e.cabin.filter((t) => t !== f);
  delivered += before - e.cabin.length;
  const room = CAPACITY - e.cabin.length;
  const take = [];
  for (let i = waiters[f].length - 1; i >= 0 && take.length < room; i--) {
    const t = waiters[f][i];
    if ((t - f) * e.dir > 0) {
      take.push(t);
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

function step(dt) {
  const rate = SPEED / 3600;
  for (let from = 0; from < N; from++) {
    for (let to = 0; to < N; to++) {
      if (from === to) continue;
      const expected = matrix[from][to] * rate * dt;
      const p = expected - Math.floor(expected);
      const r = Math.random();
      let n = Math.floor(expected);
      if (r < p) n += 1;
      for (let k = 0; k < n; k++) waiters[from].push(to);
    }
  }

  for (const e of elevators) {
    if (e.stopTimer > 0) {
      e.stopTimer -= dt;
      processStop(e, Math.round(e.pos));
      if (e.stopTimer <= 0) e.stopTimer = 0;
      continue;
    }
    const prevFloor = Math.floor(e.pos);
    e.pos += e.dir * ELEV_SPEED * dt;
    if (e.pos >= N - 1) {
      e.pos = N - 1;
      e.dir = -1;
    } else if (e.pos <= 0) {
      e.pos = 0;
      e.dir = 1;
    }
    const curFloor = Math.floor(e.pos);
    if (curFloor !== prevFloor && shouldStop(e, curFloor)) {
      stopAt(e, curFloor);
    }
  }
  simHours += (dt * SPEED) / 3600;
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
    const up = waiters[f].filter((t) => t > f).length;
    const down = waiters[f].filter((t) => t < f).length;
    const el = $(`#fwait-${f}`);
    if (el) el.textContent = `${up} \u25b2  \u25bc ${down}`;
  }
  $("#statTime").textContent = simHours.toFixed(2);
  $("#statWaiting").textContent = waiters.reduce((a, q) => a + q.length, 0);
  $("#statServed").textContent = delivered;
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

$("#apply").addEventListener("click", () => {
  N = clamp(+$("#n").value || 6, 2, 20);
  M = clamp(+$("#m").value || 2, 1, 8);
  CAPACITY = clamp(+$("#cap").value || 8, 1, 30);
  buildMatrix();
  buildBuilding();
  resetSim();
});

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
  SPEED = +$("#speed").value;
  $("#speedLabel").textContent = SPEED + "x";
});

buildMatrix();
buildBuilding();
resetSim();
$("#toggle").textContent = "Start";
requestAnimationFrame(frame);
