const COLORS = {
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
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  if (ticks.length > 8) ticks.push(max);
  return { ticks, step };
}

export class Charts {
  constructor(histCanvas, lineCanvas) {
    this.hist = histCanvas?.getContext("2d");
    this.line = lineCanvas?.getContext("2d");
  }

  draw(sim) {
    this.drawHist(sim.durations);
    this.drawLine(sim.series);
  }

  drawGrid(ctx, w, h, pad) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = pad.l + (i / 5) * (w - pad.l - pad.r);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, h - pad.b);
    }
    for (let i = 0; i < 6; i++) {
      const y = h - pad.b - (i / 5) * (h - pad.t - pad.b);
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
    }
    ctx.stroke();
  }

  drawAxes(ctx, w, h, pad) {
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
  }

  drawHist(durations) {
    const ctx = this.hist;
    if (!ctx) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 52, r: 14, t: 18, b: 34 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    if (durations.length === 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("no completed trips yet", w / 2, h / 2);
      return;
    }

    const bins = 24;
    const upper = Math.max(...durations) * 60 * 1.02 || 1;
    const counts = new Array(bins).fill(0);
    for (const d of durations) {
      const b = Math.min(bins - 1, Math.floor(((d * 60) / upper) * bins));
      counts[b]++;
    }
    const maxCount = Math.max(...counts);
    const yTicks = 6;
    this.drawGrid(ctx, w, h, pad);

    const bw = plotW / bins;
    for (let b = 0; b < bins; b++) {
      const barH = (counts[b] / maxCount) * plotH;
      if (barH < 1) continue;
      const x = pad.l + b * bw;
      const y = h - pad.b - barH;
      const grad = ctx.createLinearGradient(0, y, 0, h - pad.b);
      grad.addColorStop(0, COLORS.histFillTop);
      grad.addColorStop(1, COLORS.histFill);
      ctx.fillStyle = grad;
      roundRect(ctx, x + 1, y, bw - 2, barH, 3);
      ctx.fill();
    }

    this.drawAxes(ctx, w, h, pad);
    ctx.fillStyle = COLORS.text;
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    const yT = niceTicks(maxCount, 4);
    yT.ticks.slice(0, yTicks).forEach((v, i) => {
      const y = h - pad.b - (i / (yTicks - 1)) * plotH;
      ctx.fillText(v, pad.l - 6, y + 3);
    });
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = "left";
    ctx.fillText("trips", 4, pad.t);
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    for (let i = 0; i < 6; i++) {
      const v = (upper * (i / 5)).toFixed(2);
      const x = pad.l + (i / 5) * plotW;
      ctx.fillText(v, x, h - 12);
    }
    ctx.fillStyle = COLORS.label;
    ctx.fillText("duration (min)", pad.l + plotW / 2, h - 4);
  }

  drawLine(series) {
    const ctx = this.line;
    if (!ctx) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 52, r: 14, t: 18, b: 34 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    if (series.length < 2) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("not enough data yet", w / 2, h / 2);
      return;
    }

    const tMax = series[series.length - 1].t || 1;
    const yMax = Math.max(...series.map((s) => s.max)) * 1.02 || 1;
    const yT = niceTicks(yMax, 4);
    const yTicks = Math.min(6, yT.ticks.length);
    this.drawGrid(ctx, w, h, pad);

    const pts = series.map((s) => ({
      x: pad.l + (s.t / tMax) * plotW,
      y: h - pad.b - (s.max / yMax) * plotH,
    }));

    const area = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    area.addColorStop(0, COLORS.areaTop);
    area.addColorStop(1, COLORS.areaBot);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineTo(pts[pts.length - 1].x, h - pad.b);
    ctx.lineTo(pts[0].x, h - pad.b);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.fillStyle = COLORS.line;
    ctx.beginPath();
    ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 3, 0, Math.PI * 2);
    ctx.fill();

    this.drawAxes(ctx, w, h, pad);
    ctx.fillStyle = COLORS.text;
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    yT.ticks.slice(0, yTicks).forEach((v, i) => {
      const y = h - pad.b - (i / (yTicks - 1)) * plotH;
      ctx.fillText(v.toFixed(2), pad.l - 6, y + 3);
    });
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = "left";
    ctx.fillText("max wait (h)", 4, pad.t);
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    for (let i = 0; i < 6; i++) {
      const v = (tMax * (i / 5)).toFixed(2);
      const x = pad.l + (i / 5) * plotW;
      ctx.fillText(v, x, h - 12);
    }
    ctx.fillStyle = COLORS.label;
    ctx.fillText("time (h)", pad.l + plotW / 2, h - 4);
  }
}
