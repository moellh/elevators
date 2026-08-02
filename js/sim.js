const MAX_MOVE = 0.5;
const SECONDS_PER_HOUR = 3600;

export class Passenger {
  constructor(target, arrived) {
    this.target = target;
    this.arrived = arrived;
    this.car = null;
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
    this.pickups = new Map(); // floor -> direction (1 | -1)
  }

  get isStopped() {
    return this.stopPhase !== null;
  }

  get isIdle() {
    return this.stopPhase === null && this.cabin.length === 0 && this.pickups.size === 0;
  }

  // All floors this elevator must stop at: dropoffs of onboard passengers
  // plus floors it is committed to pick up from.
  get stopFloors() {
    const stops = new Set(this.cabin.map((p) => p.target));
    for (const f of this.pickups.keys()) stops.add(f);
    return stops;
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
    this.series = [];
    this.lastSample = 0;
  }

  applyScenario(kind, story, people) {
    const base = Math.round(people * 0.01);
    this.matrix = this.matrix.map(() => new Array(this.N).fill(0));
    for (let a = 0; a < this.N; a++) {
      for (let b = 0; b < this.N; b++) {
        if (a === b) continue;
        if (kind === "equal") {
          this.matrix[a][b] = people;
        } else {
          const hot = kind === "in" ? b === story : a === story;
          this.matrix[a][b] = hot ? people : base;
        }
      }
    }
    this.reset();
  }

  step(realDt) {
    const { speed, elevSpeed } = this.config;
    const h = Math.min(0.1, MAX_MOVE / elevSpeed);
    let remaining = realDt * speed;
    while (remaining > 1e-9) {
      const d = Math.min(h, remaining);
      this.stepOnce(d);
      remaining -= d;
    }
    this.simHours += (realDt * speed) / SECONDS_PER_HOUR;
    if (this.simHours - this.lastSample >= 0.02) {
      const window = this.durations.slice(-100);
      this.series.push({
        t: this.simHours,
        max: window.length ? Math.max(...window) : 0,
      });
      this.lastSample = this.simHours;
    }
  }

  stepOnce(simDt) {
    this.spawnArrivals(simDt);
    for (const e of this.elevators) {
      if (e.isStopped) {
        this.advanceStop(e, simDt);
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
          const passenger = new Passenger(to, this.simHours);
          this.waiters[from].push(passenger);
          this.dispatch(passenger, from);
        }
      }
    }
  }

  // Assign a fresh request to the elevator that can serve it soonest.
  dispatch(passenger, from) {
    const dir = Math.sign(passenger.target - from);
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < this.M; i++) {
      const e = this.elevators[i];
      let cost;
      if (e.isStopped && Math.round(e.pos) === from && e.dir === dir && e.cabin.length < this.config.capacity) {
        cost = 0; // already here with doors open
      } else if (e.isIdle) {
        cost = Math.abs(e.pos - from);
      } else {
        const onTheWay =
          e.dir === dir &&
          ((dir > 0 && from >= e.pos) || (dir < 0 && from <= e.pos));
        if (onTheWay) {
          cost = Math.abs(e.pos - from);
        } else {
          const end = e.dir > 0 ? this.N - 1 : 0;
          cost = Math.abs(e.pos - end) + Math.abs(end - from);
        }
      }
      cost += e.pickups.size * 0.2; // balance load
      if (e.cabin.length >= this.config.capacity) cost += 10; // avoid full cars
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    this.elevators[best].pickups.set(from, dir);
    passenger.car = best;
  }

  // Remove an assigned pickup (floor+dir) from every elevator once it is served.
  clearPickup(f, dir) {
    for (const e of this.elevators) {
      if (e.pickups.get(f) === dir) e.pickups.delete(f);
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

  // Busiest floor by number of waiting people; ties go to the lowest floor.
  busiestFloor() {
    let best = 0;
    let bestCount = -1;
    for (let f = 0; f < this.N; f++) {
      const n = this.waiters[f].length;
      if (n > bestCount) {
        bestCount = n;
        best = f;
      }
    }
    return best;
  }

  dominantDirection(f) {
    let up = 0;
    let down = 0;
    for (const p of this.waiters[f]) {
      if (p.target > f) up++;
      else if (p.target < f) down++;
    }
    return up >= down ? 1 : -1;
  }

  // Empty elevator with nothing to do: park at the busiest floor so it is
  // ready for the next wave of passengers.
  idlePark(e) {
    if (this.totalWaiting === 0) return false;
    const target = this.busiestFloor();
    const dir = this.dominantDirection(target);
    e.pickups.set(target, dir);
    e.dir = dir;
    return true;
  }

  hasStopAhead(e, dir) {
    for (const s of e.stopFloors) {
      if (dir > 0 ? s > e.pos + 1e-6 : s < e.pos - 1e-6) return true;
    }
    return false;
  }

  hasStopBehind(e, dir) {
    for (const s of e.stopFloors) {
      if (dir > 0 ? s < e.pos - 1e-6 : s > e.pos + 1e-6) return true;
    }
    return false;
  }

  move(e, simDt) {
    const here = Math.round(e.pos);
    if (Math.abs(e.pos - here) < 1e-6 && this.shouldStop(e, here)) {
      this.stopAt(e, here);
      return;
    }

    // Reverse when nothing is left ahead, unless fully idle.
    if (!this.hasStopAhead(e, e.dir)) {
      if (this.hasStopBehind(e, e.dir) || e.pickups.size > 0 || e.cabin.length > 0) {
        e.dir = -e.dir;
        if (Math.abs(e.pos - Math.round(e.pos)) < 1e-6 && this.shouldStop(e, Math.round(e.pos))) {
          this.stopAt(e, Math.round(e.pos));
          return;
        }
      } else if (this.idlePark(e)) {
        // will move next step toward the parked floor
      } else {
        this.settle(e, simDt);
        return;
      }
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
    if (e.pickups.get(f) === e.dir) return true;
    return false;
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
    this.clearPickup(f, e.dir);
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
