const MAX_MOVE = 0.5;
const SECONDS_PER_HOUR = 3600;

export class Passenger {
  constructor(target, arrived) {
    this.target = target;
    this.arrived = arrived;
  }
}

export class Elevator {
  constructor() {
    this.pos = 0;
    this.dir = 1;
    this.cabin = [];
    this.stopPhase = null; // null | "open" | "leave" | "enter" | "close"
    this.stopTimer = 0;
    this.leaving = [];
  }

  get isStopped() {
    return this.stopPhase !== null;
  }

  get isIdle() {
    return this.stopPhase === null && this.cabin.length === 0;
  }
}

export class Simulation {
  constructor(config) {
    this.config = config;
    this.matrix = [];
    this.waiters = [];
    this.elevators = [];
    this.delivered = 0;
    this.simHours = 0;
    this.durations = [];
    this.maxDur = 0;
    this.series = [];
    this.lastSample = 0;
    this.resize();
  }

  get N() {
    return this.config.stories;
  }

  get M() {
    return this.config.elevators;
  }

  get totalWaiting() {
    return this.waiters.reduce((a, q) => a + q.length, 0);
  }

  get longestWait() {
    return this.waiters.reduce(
      (a, q) => q.reduce((m, p) => Math.max(m, this.simHours - p.arrived), a),
      0
    );
  }

  resize() {
    this.matrix = Array.from({ length: this.N }, () => new Array(this.N).fill(0));
    this.waiters = Array.from({ length: this.N }, () => []);
    this.elevators = Array.from({ length: this.M }, () => new Elevator());
    this.reset();
  }

  reset() {
    this.waiters = Array.from({ length: this.N }, () => []);
    this.elevators = Array.from({ length: this.M }, () => new Elevator());
    this.delivered = 0;
    this.simHours = 0;
    this.durations = [];
    this.maxDur = 0;
    this.series = [];
    this.lastSample = 0;
  }

  applyScenario(kind, story, people) {
    const base = Math.round(people * 0.01);
    this.matrix = this.matrix.map(() => new Array(this.N).fill(0));
    for (let a = 0; a < this.N; a++) {
      for (let b = 0; b < this.N; b++) {
        if (a === b) continue;
        const hot = kind === "in" ? b === story : a === story;
        this.matrix[a][b] = hot ? people : base;
      }
    }
    this.reset();
  }

  step(realDt) {    const { speed, elevSpeed } = this.config;
    const h = Math.min(0.1, MAX_MOVE / elevSpeed);
    let remaining = realDt * speed;
    while (remaining > 1e-9) {
      const d = Math.min(h, remaining);
      this.stepOnce(d);
      remaining -= d;
    }
    this.simHours += (realDt * speed) / SECONDS_PER_HOUR;
    if (this.simHours - this.lastSample >= 0.02) {
      this.series.push({ t: this.simHours, max: this.maxDur });
      this.lastSample = this.simHours;
    }
  }

  stepOnce(simDt) {
    this.spawnArrivals(simDt);
    for (const e of this.elevators) {
      if (e.isStopped) {
        this.advanceStop(e, simDt);
      } else if (this.totalWaiting === 0 && e.cabin.length === 0) {
        this.settle(e, simDt);
      } else {
        this.move(e, simDt);
      }
    }
  }

  spawnArrivals(simDt) {
    for (let from = 0; from < this.N; from++) {
      for (let to = 0; to < this.N; to++) {
        if (from === to) continue;
        const expected = this.matrix[from][to] * (1 / SECONDS_PER_HOUR) * simDt;
        const p = expected - Math.floor(expected);
        const n = Math.floor(expected) + (Math.random() < p ? 1 : 0);
        for (let k = 0; k < n; k++) {
          this.waiters[from].push(new Passenger(to, this.simHours));
        }
      }
    }
  }

  // If demand vanishes mid-flight, glide to the next story and stop there.
  settle(e, simDt) {
    if (e.pos !== Math.round(e.pos)) {
      const target = e.dir > 0 ? Math.ceil(e.pos) : Math.floor(e.pos);
      e.pos += e.dir * this.config.elevSpeed * simDt;
      e.pos = e.dir > 0 ? Math.min(e.pos, target) : Math.max(e.pos, target);
    }
  }

  move(e, simDt) {
    const here = Math.round(e.pos);
    if (Math.abs(e.pos - here) < 1e-6 && this.shouldStop(e, here)) {
      this.stopAt(e, here);
      return;
    }
    const prevPos = e.pos;
    e.pos += e.dir * this.config.elevSpeed * simDt;
    if (e.pos >= this.N - 1) {
      e.pos = this.N - 1;
      e.dir = -1;
    } else if (e.pos <= 0) {
      e.pos = 0;
      e.dir = 1;
    }
    const arrival = this.arrivedAt(prevPos, e.pos, e.dir);
    if (arrival != null && this.shouldStop(e, arrival)) {
      this.stopAt(e, arrival);
    }
  }

  arrivedAt(prevPos, pos, dir) {
    if (dir > 0) {
      const f = Math.floor(prevPos) + 1;
      if (f < this.N && pos >= f) return f;
    } else {
      const f = Math.ceil(prevPos) - 1;
      if (f >= 0 && pos <= f) return f;
    }
    return null;
  }

  shouldStop(e, f) {
    if (e.cabin.some((p) => p.target === f)) return true;
    if (e.cabin.length >= this.config.capacity) return false;
    return this.waiters[f].some((p) => (p.target - f) * e.dir > 0);
  }

  stopAt(e, f) {
    e.pos = f;
    e.leaving = e.cabin.filter((p) => p.target === f);
    e.stopPhase = "open";
    e.stopTimer = this.config.stopTime / 2;
  }

  hasBoarding(e, f) {
    if (e.cabin.length >= this.config.capacity) return false;
    return this.waiters[f].some((p) => (p.target - f) * e.dir > 0);
  }

  boardOne(e, f) {
    const idx = this.waiters[f].findIndex((p) => (p.target - f) * e.dir > 0);
    if (idx === -1) return false;
    e.cabin.push(this.waiters[f].splice(idx, 1)[0]);
    return true;
  }

  advanceStop(e, simDt) {
    const f = Math.round(e.pos);
    const { stopTime, boardTime } = this.config;
    e.stopTimer -= simDt;
    if (e.stopTimer > 0) return;

    if (e.stopPhase === "open") {
      if (e.leaving.length > 0) {
        e.stopPhase = "leave";
        e.stopTimer = boardTime;
      } else if (this.hasBoarding(e, f)) {
        e.stopPhase = "enter";
        e.stopTimer = boardTime;
      } else {
        e.stopPhase = "close";
        e.stopTimer = stopTime / 2;
      }
    } else if (e.stopPhase === "leave") {
      const p = e.leaving.pop();
      e.cabin = e.cabin.filter((x) => x !== p);
      this.delivered++;
      const dur = this.simHours - p.arrived;
      this.durations.push(dur);
      if (dur > this.maxDur) this.maxDur = dur;
      if (e.leaving.length > 0) {
        e.stopTimer = boardTime;
      } else if (this.hasBoarding(e, f)) {
        e.stopPhase = "enter";
        e.stopTimer = boardTime;
      } else {
        e.stopPhase = "close";
        e.stopTimer = stopTime / 2;
      }
    } else if (e.stopPhase === "enter") {
      if (this.boardOne(e, f)) {
        e.stopTimer = this.hasBoarding(e, f) ? boardTime : stopTime / 2;
        if (!this.hasBoarding(e, f)) e.stopPhase = "close";
      } else {
        e.stopPhase = "close";
        e.stopTimer = stopTime / 2;
      }
    } else if (e.stopPhase === "close") {
      e.stopPhase = null;
      e.stopTimer = 0;
    }
  }
}
