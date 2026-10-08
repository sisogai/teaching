// Run with: node --test tests/*.test.cjs (no dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../micro_chapter3_producer_theory.html'), 'utf8');
const code = html.slice(html.indexOf('    function solveShortRun('), html.indexOf('    function drawIso('));
const context = vm.createContext({});
vm.runInContext(code, context);
const solve = context.solveShortRun;
const near = (actual, expected, tol = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);

test('reported regression: profitable optimum beyond Q = 18', () => {
  const r = solve(0.02, 1, 20, 24, 9);
  near(r.supply, 26.38491982474217);
  near(r.profit, 14.565252671248188);
  assert.equal(r.decision, 'Produce, profit');
  assert.ok(r.qBE > 18);
  near(r.qBE, 25.89480029451514);
  near(r.pBE, 8.442840348539004);
  near(r.mc(r.qBE), r.pBE);
});

test('shutdown below, at, and above min AVC; FC is paid at Q = 0', () => {
  const params = [0.12, 1.2, 8, 24];
  const threshold = solve(...params, 18).pShutdown;
  for (const p of [threshold - 1e-6, threshold]) {
    const r = solve(...params, p);
    assert.equal(r.supply, 0);
    assert.equal(r.profit, -24);
    assert.equal(r.decision, 'Shutdown');
  }
  const r = solve(...params, threshold + 1e-6);
  assert.ok(r.supply > r.qShutdown);
  assert.equal(r.decision, 'Produce, loss');
  near(threshold * r.qShutdown - (0.12 * r.qShutdown ** 3 - 1.2 * r.qShutdown ** 2 + 8 * r.qShutdown), 0);
});

test('break-even and neighboring loss/profit classifications', () => {
  for (const params of [[0.02, 1, 20, 24], [0.12, 1.2, 8, 24], [0.4, 0, 20, 80]]) {
    const { pBE, qBE } = solve(...params, 40);
    const r = solve(...params, pBE);
    near(r.supply, qBE);
    near(r.profit, 0);
    assert.equal(r.decision, 'Produce, break even');
    assert.equal(solve(...params, pBE - 1e-5).decision, 'Produce, loss');
    assert.equal(solve(...params, pBE + 1e-5).decision, 'Produce, profit');
  }
});

test('FC = 0, d = 0, and their joint zero-output boundary', () => {
  const zeroFC = solve(0.12, 1.2, 8, 0, 18);
  near(zeroFC.qBE, zeroFC.qShutdown);
  near(zeroFC.pBE, zeroFC.pShutdown);
  assert.equal(solve(0.12, 1.2, 8, 0, zeroFC.pShutdown).decision, 'Shutdown');
  const zeroD = solve(0.12, 0, 8, 24, 18);
  near(zeroD.qBE, Math.cbrt(24 / (2 * 0.12)));
  const both = solve(0.12, 0, 8, 0, 8);
  assert.equal(both.qBE, 0);
  assert.equal(both.pBE, 8);
  assert.equal(both.profit, 0);
  assert.equal(both.supply, 0);
  assert.equal(solve(0.12, 0, 8, 0, 8.001).decision, 'Produce, profit');
});

test('slider extrema: global optimum, AC minimum, and profit sign', () => {
  for (const a of [0.02, 0.12, 0.4]) for (const d of [0, 1.2, 3])
    for (const b of [0, 8, 20]) for (const fc of [0, 24, 80]) for (const p of [2, 9, 18, 40]) {
      const r = solve(a, d, b, fc, p);
      const profitAt = (q) => p * q - (a * q ** 3 - d * q ** 2 + b * q + fc);
      near(r.profit, profitAt(r.supply));
      assert.ok(r.profit >= -fc - 1e-8);
      const upper = Math.max(18, 2 * r.supply, 2 * r.qBE);
      for (let i = 1; i <= 200; i++) {
        const q = upper * i / 200;
        assert.ok(profitAt(q) <= r.profit + 1e-7, 'supply is globally optimal');
        assert.ok(r.ac(q) >= r.pBE - 1e-7, 'break-even is the global AC infimum');
      }
      if (r.qBE > 0) near(r.mc(r.qBE), r.pBE);
      if (r.supply > 0) {
        near(r.mc(r.supply), p);
        assert.equal(r.decision, r.profit < 0 ? 'Produce, loss' : 'Produce, profit');
      }
    }
});

test('drawShortRun uses the actual profit and identifies an off-chart optimum', () => {
  const elements = {};
  const dots = [];
  const params = { shortA: 0.02, shortD: 1, shortB: 20, shortFc: 24, shortP: 9 };
  const sandbox = vm.createContext({
    val: (id) => params[id],
    $: (id) => elements[id] ||= {},
    fmt: (x) => x.toFixed(2),
    setupCanvas: () => ({ ctx: { fillText() {} }, sx: (x) => x, sy: (y) => y }),
    addAxisLabels() {}, drawLine() {}, dot: (...args) => dots.push(args),
  });
  vm.runInContext(code, sandbox);
  sandbox.drawShortRun();
  assert.equal(elements.decisionOut.textContent, 'Produce, profit');
  assert.equal(elements.shortProfitOut.textContent, '14.57');
  assert.equal(elements.supplyOut.textContent, '26.38');
  assert.match(elements.shortPlotNote.textContent, /26\.38.*beyond.*18/);
  assert.ok(dots.every((args) => args[1] <= 18));
  params.shortP = 2;
  sandbox.drawShortRun();
  assert.equal(elements.decisionOut.textContent, 'Shutdown');
  assert.equal(elements.shortProfitOut.textContent, '-24.00');
  assert.equal(elements.shortPlotNote.textContent, '');
  // An exact Q = 18 can be computed as 18.000000000000004.
  params.shortA = 0.04;
  params.shortD = 0.8;
  params.shortB = 8;
  for (const q of [17.999, 18, 18.001]) {
    params.shortP = 3 * params.shortA * q * q - 2 * params.shortD * q + params.shortB;
    dots.length = 0;
    sandbox.drawShortRun();
    assert.equal(elements.shortPlotNote.textContent !== '', q > 18);
    assert.equal(dots.some((args) => args[5] === 's(p)'), q <= 18);
    assert.ok(dots.every((args) => args[1] <= 18));
  }
});
