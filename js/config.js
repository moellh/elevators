export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const BOUNDS = {
  stories: [2, 20],
  elevators: [1, 8],
  capacity: [1, 30],
  elevSpeed: [0.1, 20],
  stopTime: [0, 10],
  boardTime: [0, 5],
  speed: [1, Infinity],
  people: [0, Infinity],
};

export const DEFAULTS = {
  stories: 6,
  elevators: 2,
  capacity: 8,
  elevSpeed: 1,
  stopTime: 10,
  boardTime: 1.5,
  speed: 2,
  scenarioStory: 0,
  scenarioPeople: 100,
};

const STORAGE_KEY = "elevator-sim";

export function sanitizeConfig(raw = {}) {
  const c = { ...DEFAULTS };
  c.stories = clamp(Math.round(+raw.stories) || c.stories, ...BOUNDS.stories);
  c.elevators = clamp(Math.round(+raw.elevators) || c.elevators, ...BOUNDS.elevators);
  c.capacity = clamp(Math.round(+raw.capacity) || c.capacity, ...BOUNDS.capacity);
  c.elevSpeed = clamp(+raw.elevSpeed || c.elevSpeed, ...BOUNDS.elevSpeed);
  c.stopTime = clamp(+raw.stopTime ?? c.stopTime, ...BOUNDS.stopTime);
  c.boardTime = clamp(+raw.boardTime ?? c.boardTime, ...BOUNDS.boardTime);
  c.speed = Math.max(1, Math.round(+raw.speed) || c.speed);
  c.scenarioStory = clamp(Math.round(+raw.scenarioStory) || 0, 0, c.stories - 1);
  c.scenarioPeople = Math.max(0, Math.round(+raw.scenarioPeople) || c.scenarioPeople);
  return c;
}

export function saveState(cfg, matrix) {
  try {
    const state = { ...cfg, matrix };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
