// Run with: node --test tests/*.test.cjs (no dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../micro_chapter2_economy_markets.html'), 'utf8');
const code = html.slice(html.indexOf('    function solveMarket('), html.indexOf('    function initPage('));
const context = vm.createContext({});
vm.runInContext(code, context);
const solve = context.solveMarket;
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);

test('reported regression: zero trade throughout the closed price interval [4, 40]', () => {
  for (const price of [4, 4.001, 15, 39.999, 40]) {
    const r = solve(20, 5, -20, 0.5, price);
    assert.equal(r.pLow, 4);
    assert.equal(r.pHigh, 40);
    assert.equal(r.qStar, 0);
    assert.equal(r.demand, 0);
    assert.equal(r.supply, 0);
    assert.equal(r.gap, 0);
    assert.equal(r.direction, 0);
  }
});

test('immediately outside the interval, excess demand/supply gives matching pressure', () => {
  for (const [price, gap] of [[0, 20], [3.999, 0.005], [40.001, -0.0005], [45, -2.5]]) {
    const r = solve(20, 5, -20, 0.5, price);
    near(r.gap, gap);
    assert.equal(r.direction, Math.sign(gap));
  }
});

test('collapsed zero-trade interval and both neighboring directions', () => {
  for (const [price, direction] of [[9.99, 1], [10, 0], [10.01, -1]]) {
    const r = solve(20, 2, -20, 2, price);
    assert.equal(r.pLow, 10);
    assert.equal(r.pHigh, 10);
    assert.equal(r.qStar, 0);
    assert.equal(r.direction, direction);
  }
  // Decimal slopes can produce a tiny endpoint discrepancy at exact collapse.
  const decimal = solve(21, 0.7, -3, 0.1, 30);
  near(decimal.pLow, 30);
  near(decimal.pHigh, 30);
  assert.equal(decimal.qStar, 0);
  assert.equal(decimal.direction, 0);
});

test('ordinary positive-quantity equilibrium and small real price pressure', () => {
  const r = solve(90, 2, 10, 2, 20);
  assert.equal(r.pLow, 20);
  assert.equal(r.pHigh, 20);
  assert.equal(r.qStar, 50);
  assert.equal(r.direction, 0);
  near(solve(90, 2, 10, 2, 19.99).gap, 0.04);
  assert.equal(solve(90, 2, 10, 2, 19.99).direction, 1);
  assert.equal(solve(90, 2, 10, 2, 20.01).direction, -1);
});

test('transitions from positive trade through collapse to a zero-trade interval', () => {
  const positive = solve(20, 2, -19, 2, 10);
  near(positive.qStar, 0.5);
  near(positive.pLow, 9.75);
  const collapsed = solve(20, 2, -20, 2, 10);
  assert.equal(collapsed.qStar, 0);
  assert.equal(collapsed.pLow, collapsed.pHigh);
  const interval = solve(20, 2, -21, 2, 10);
  assert.equal(interval.qStar, 0);
  assert.equal(interval.pLow, 10);
  assert.equal(interval.pHigh, 10.5);
});

test('slider corners: nonnegative equilibrium quantity, clearing, and endpoint directions', () => {
  for (const A of [20, 90, 120]) for (const B of [0.5, 2, 5])
    for (const C of [-20, 0, 10, 40]) for (const D of [0.5, 2, 5]) {
      const r = solve(A, B, C, D, 15);
      assert.ok(r.qStar >= 0);
      assert.ok(r.pLow <= r.pHigh);
      for (const p of [r.pLow, (r.pLow + r.pHigh) / 2, r.pHigh]) {
        near(r.qd(p), r.qStar);
        near(r.qs(p), r.qStar);
        assert.equal(solve(A, B, C, D, p).direction, 0);
      }
      assert.equal(solve(A, B, C, D, r.pLow - 0.001).direction, 1);
      assert.equal(solve(A, B, C, D, r.pHigh + 0.001).direction, -1);
    }
});

function draw(params) {
  const elements = {}, dots = [], strokes = [], labels = [];
  let points = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, clip() {}, rect() {},
    beginPath() { points = []; },
    moveTo(x, y) { points.push([x, y]); },
    lineTo(x, y) { points.push([x, y]); },
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth, points }); },
    fillText(text) { labels.push(text); },
  };
  const sandbox = vm.createContext({
    val: (id) => params[id], $: (id) => elements[id] ||= {},
    fmt: (x, n = 2) => Number(x).toFixed(n).replace(/\.?0+$/, ''),
    colors: { blue: 'blue', green: 'green', orange: 'orange' },
    setupCanvas: () => ({ ctx, sx: (x) => x, sy: (y) => y, m: { l: 0, r: 0, t: 0, b: 0 }, w: 140, h: 45, cssW: 140, cssH: 45 }),
    drawPath() {}, dot: (_ctx, q, p, _sx, _sy, label) => dots.push([q, p, label]),
    lineLabel: (_ctx, label) => labels.push(label),
  });
  vm.runInContext(code, sandbox);
  sandbox.drawMarket();
  return { elements, dots, strokes, labels };
}

test('drawMarket displays and highlights the full closed zero-trade interval', () => {
  const { elements, dots, strokes } = draw({ dA: 20, dB: 5, sC: -20, sD: 0.5, trialP: 15 });
  assert.equal(elements.pStarOut.textContent, '4–40');
  assert.equal(elements.qStarOut.textContent, '0');
  assert.equal(elements.gapOut.textContent, 'Clears');
  assert.equal(elements.pressureOut.textContent, 'Stable');
  assert.match(elements.marketExplain.textContent, /closed interval \[4, 40\].*Q = 0.*both endpoints/);
  assert.deepEqual(dots, [[0, 4, 'E* lower'], [0, 40, 'E* upper']]);
  const highlight = strokes.find((s) => s.width === 6);
  assert.deepEqual(highlight.points, [[0, 4], [0, 40]]);
  const demand = strokes.find((s) => s.color === 'blue');
  const supply = strokes.find((s) => s.color === 'green');
  assert.ok(demand.points.some(([q, p]) => q === 0 && p === 4));
  assert.ok(supply.points.some(([q, p]) => q === 0 && p === 40));
  for (const s of [demand, supply]) assert.ok(s.points.every(([q]) => q >= 0));
});

test('drawMarket handles a collapsed interval and positive equilibrium as single points', () => {
  for (const [A, B, C, D, trial, price, quantity] of [[20, 2, -20, 2, 10, '10', '0'], [90, 2, 10, 2, 20, '20', '50']]) {
    const { elements, dots, strokes } = draw({ dA: A, dB: B, sC: C, sD: D, trialP: trial });
    assert.equal(elements.pStarOut.textContent, price);
    assert.equal(elements.qStarOut.textContent, quantity);
    assert.equal(elements.pressureOut.textContent, 'Stable');
    assert.equal(dots.length, 1);
    assert.ok(!strokes.some((s) => s.width === 6));
  }
});

test('drawMarket keeps small excess quantities and off-chart equilibria explicit', () => {
  for (const [trial, gapText, pressure] of [[3.999, 'Excess demand 0.0050', 'Price rises'], [40.001, 'Excess supply 0.00050', 'Price falls']]) {
    const { elements } = draw({ dA: 20, dB: 5, sC: -20, sD: 0.5, trialP: trial });
    assert.equal(elements.gapOut.textContent, gapText);
    assert.equal(elements.pressureOut.textContent, pressure);
  }
  for (const params of [{ dA: 120, dB: 0.5, sC: -20, sD: 0.5, trialP: 15 }, { dA: 20, dB: 2, sC: 40, sD: 2, trialP: 0 }]) {
    const { elements, dots } = draw(params);
    assert.equal(dots.length, 0);
    assert.match(elements.marketExplain.textContent, /displayed range.*full model/);
  }
});

test('all Chapter 2 inline JavaScript parses', () => {
  for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});
