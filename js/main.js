import { clamp, BOUNDS, DEFAULTS, sanitizeConfig, saveState, loadState } from "./config.js";
import { Simulation } from "./sim.js";
import { BuildingView } from "./building.js";
import { Charts } from "./charts.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  n: $("#n"),
  m: $("#m"),
  cap: $("#cap"),
  elevSpeed: $("#elevSpeed"),
  stopTime: $("#stopTime"),
  boardTime: $("#boardTime"),
  speed: $("#speed"),
  scenarioStory: $("#scenarioStory"),
  scenarioPeople: $("#scenarioPeople"),
  toggle: $("#toggle"),
  reset: $("#reset"),
  scenario1toN: $("#scenario1toN"),
  scenarioNto1: $("#scenarioNto1"),
  statTime: $("#statTime"),
  statServed: $("#statServed"),
  statWaiting: $("#statWaiting"),
  statMaxWait: $("#statMaxWait"),
  statTrips: $("#statTrips"),
};

const config = sanitizeConfig(loadState() ?? DEFAULTS);
const sim = new Simulation(config);
const building = new BuildingView($("#building-wrap"));
const charts = new Charts($("#hist"), $("#line"));

let running = false;
let last = null;

function readNumeric(id, fallback, bounds) {
  return clamp(Math.round(+els[id].value) || fallback, ...bounds);
}

function applyDimensions() {
  const next = {
    ...config,
    stories: readNumeric("n", DEFAULTS.stories, BOUNDS.stories),
    elevators: readNumeric("m", DEFAULTS.elevators, BOUNDS.elevators),
    capacity: readNumeric("cap", DEFAULTS.capacity, BOUNDS.capacity),
  };
  Object.assign(config, next);
  els.scenarioStory.max = config.stories - 1;
  if (els.scenarioStory.value > config.stories - 1) els.scenarioStory.value = 0;
  sim.resize();
  building.build(config);
  persist();
}

function persist() {
  saveState(config, sim.matrix);
}

function render() {
  building.render(sim);

  els.statTime.textContent = sim.simHours.toFixed(2);
  els.statWaiting.textContent = sim.totalWaiting;
  els.statServed.textContent = sim.delivered;
  els.statMaxWait.textContent = sim.longestWait.toFixed(2);
  els.statTrips.textContent = sim.durations.length;

  charts.draw(sim);
}

function frame(ts) {
  if (last == null) last = ts;
  const dt = Math.min((ts - last) / 1000, 0.1);
  last = ts;
  if (running) {
    sim.step(dt);
    render();
  }
  requestAnimationFrame(frame);
}

// --- config inputs ---

for (const id of ["n", "m", "cap"]) {
  els[id].addEventListener("input", applyDimensions);
  els[id].addEventListener("change", applyDimensions);
}

const bindNumber = (id, key, fallback, bounds, round) => (e) => {
  const raw = round ? Math.round(+els[id].value) : +els[id].value;
  config[key] = clamp(raw || fallback, ...bounds);
  els[id].value = config[key];
  persist();
};

els.elevSpeed.addEventListener("input", bindNumber("elevSpeed", "elevSpeed", DEFAULTS.elevSpeed, BOUNDS.elevSpeed, false));
els.stopTime.addEventListener("input", bindNumber("stopTime", "stopTime", DEFAULTS.stopTime, BOUNDS.stopTime, false));
els.boardTime.addEventListener("input", bindNumber("boardTime", "boardTime", DEFAULTS.boardTime, BOUNDS.boardTime, false));
els.speed.addEventListener("input", bindNumber("speed", "speed", DEFAULTS.speed, BOUNDS.speed, true));

// --- scenario controls ---

els.scenario1toN.addEventListener("click", () => {
  sim.applyScenario("out", +els.scenarioStory.value, +els.scenarioPeople.value);
  persist();
});

els.scenarioNto1.addEventListener("click", () => {
  sim.applyScenario("in", +els.scenarioStory.value, +els.scenarioPeople.value);
  persist();
});

for (const id of ["scenarioStory", "scenarioPeople"]) {
  els[id].addEventListener("input", () => {
    config.scenarioStory = Math.max(0, Math.round(+els.scenarioStory.value) || 0);
    config.scenarioPeople = Math.max(0, Math.round(+els.scenarioPeople.value) || 0);
    persist();
  });
}

// --- transport buttons ---

els.toggle.addEventListener("click", () => {
  running = !running;
  els.toggle.textContent = running ? "Pause" : "Start";
  last = null;
});

els.reset.addEventListener("click", () => {
  sim.reset();
});

// --- wheel-to-step on number inputs ---

document.addEventListener(
  "wheel",
  (e) => {
    const input = e.target.closest("input[type=number]");
    if (!input || input.disabled) return;
    e.preventDefault();
    const step = +input.step || 1;
    input.value = +input.value + (e.deltaY < 0 ? 1 : -1) * step;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("change"));
  },
  { passive: false }
);

// --- boot ---

function syncInputs() {
  els.n.value = config.stories;
  els.m.value = config.elevators;
  els.cap.value = config.capacity;
  els.elevSpeed.value = config.elevSpeed;
  els.stopTime.value = config.stopTime;
  els.boardTime.value = config.boardTime;
  els.speed.value = config.speed;
  els.scenarioStory.value = config.scenarioStory;
  els.scenarioPeople.value = config.scenarioPeople;
  els.scenarioStory.max = config.stories - 1;
}

syncInputs();

const loaded = loadState();
if (loaded?.matrix) {
  sim.loadMatrix(loaded.matrix);
} else {
  sim.applyScenario("out", config.scenarioStory, config.scenarioPeople);
  persist();
}

building.build(config);
els.toggle.textContent = "Start";
requestAnimationFrame(frame);
