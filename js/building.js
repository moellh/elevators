export const BUILDING = {
  carHeight: 48,
  gap: 14,
};

export class BuildingView {
  constructor(root) {
    this.root = root;
    this.cars = [];
    this.floorChips = [];
  }

  get pitch() {
    return BUILDING.carHeight + BUILDING.gap;
  }

  build({ stories, elevators }) {
    const { carHeight, gap } = BUILDING;
    const pitch = this.pitch;
    const totalHeight = stories * carHeight + (stories - 1) * gap;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--fh", `${carHeight}px`);
    rootStyle.setProperty("--gap", `${gap}px`);
    rootStyle.setProperty("--pitch", `${pitch}px`);

    this.root.innerHTML = "";
    this.cars = [];
    this.floorChips = [];

    const floorPanel = document.createElement("div");
    floorPanel.id = "floor-panel";
    for (let f = stories - 1; f >= 0; f--) {
      const row = document.createElement("div");
      row.className = "frow";
      row.style.height = `${carHeight}px`;
      row.style.marginBlockEnd = f > 0 ? `${gap}px` : "0";
      row.style.borderBlockEnd = f > 0 ? "1px solid var(--line)" : "none";
      row.innerHTML = `
        <span class="flabel">F${f}</span>
        <span class="fchip up" data-floor="${f}"></span>
        <span class="fchip down" data-floor="${f}"></span>`;
      floorPanel.appendChild(row);
    }

    const shafts = document.createElement("div");
    shafts.id = "shafts";
    for (let i = 0; i < elevators; i++) {
      const col = document.createElement("div");
      col.className = "shaft-col";

      const shaft = document.createElement("div");
      shaft.className = "shaft";
      shaft.style.height = `${totalHeight}px`;

      const car = document.createElement("div");
      car.className = "car";
      car.style.height = `${carHeight}px`;
      car.innerHTML = `
        <div class="car-hud">
          <span class="car-arrow"></span>
          <span class="car-count"></span>
          <div class="car-fill"><div class="car-fill-bar"></div></div>
        </div>`;
      shaft.appendChild(car);
      col.appendChild(shaft);

      const name = document.createElement("div");
      name.className = "shaft-name";
      name.textContent = `E${i + 1}`;
      col.appendChild(name);

      shafts.appendChild(col);
      this.cars.push({
        car,
        arrow: car.querySelector(".car-arrow"),
        count: car.querySelector(".car-count"),
        fill: car.querySelector(".car-fill-bar"),
      });
    }

    this.floorChips = Array.from(floorPanel.querySelectorAll(".fchip"));
    this.root.append(floorPanel, shafts);
    this.root.style.height = `${totalHeight}px`;
  }

  render(sim) {
    const pitch = this.pitch;
    const { capacity } = sim.config;

    for (let i = 0; i < this.cars.length; i++) {
      const e = sim.elevators[i];
      const ref = this.cars[i];
      ref.car.style.bottom = `${e.pos * pitch}px`;
      ref.car.classList.toggle("car-idle", e.isIdle && sim.totalWaiting === 0);
      ref.arrow.textContent = e.dir > 0 ? "\u25b2" : "\u25bc";
      ref.arrow.className = `car-arrow ${e.dir > 0 ? "up" : "down"}`;
      ref.count.textContent = `${e.cabin.length}/${capacity}`;
      ref.fill.style.width = `${(e.cabin.length / capacity) * 100}%`;
      ref.fill.classList.toggle("full", e.cabin.length >= capacity);
    }

    for (let f = 0; f < sim.N; f++) {
      const up = sim.waiters[f].filter((p) => p.target > f).length;
      const down = sim.waiters[f].filter((p) => p.target < f).length;
      const upEl = this.floorChips[2 * (sim.N - 1 - f)];
      const downEl = this.floorChips[2 * (sim.N - 1 - f) + 1];
      upEl.textContent = f < sim.N - 1 ? `\u25b2 ${up}` : "";
      upEl.classList.toggle("has", f < sim.N - 1 && up > 0);
      downEl.textContent = f > 0 ? `\u25bc ${down}` : "";
      downEl.classList.toggle("has", f > 0 && down > 0);
    }
  }
}
