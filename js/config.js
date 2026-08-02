export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const BOUNDS = {
  stories: [2, 20],
  elevators: [1, 20],
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
  stopTime: 7,
  boardTime: 1.5,
  speed: 2,
  scenarioStory: 0,
  scenarioPeople: 100,
  seed: 1,
  // Strategy tuning
  pickupThreshold: 5, // only commit a pickup when >= this many wait (0 = off)
  maxCollect: 12, // keep doors open to collect up to this many per stop
};
