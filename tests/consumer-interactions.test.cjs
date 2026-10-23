// Run with node --test tests/*.test.cjs; no additional dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(process.env.CHAPTER4_HTML || path.join(__dirname, '../micro_chapter4_consumer_theory.html'), 'utf8');
function harness() {
  const elements = new Map();
  for (const [, tag, id] of html.matchAll(/(<[^>]*\bid="([^"]+)"[^>]*>)/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const calls = [];
    const ctx = new Proxy({}, { get: (obj, key) => obj[key] || ((...args) => calls.push([key, ...args])) });
    elements.set(id, { ...attrs, style: {}, dataset: {}, calls, textContent: '',
      getAttribute: key => attrs[key], getBoundingClientRect: () => ({ width: +attrs.width, height: +attrs.height }),
      getContext: () => ctx, addEventListener() {} });
  }
  const sandbox = vm.createContext({ document: { getElementById: id => elements.get(id), querySelectorAll: () => [] },
    window: { devicePixelRatio: 1, addEventListener() {} } });
  vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1], sandbox);
  return { sandbox, elements, run: code => vm.runInContext(code, sandbox),
    set: values => { for (const [id, value] of Object.entries(values)) elements.get(id).value = String(value); },
    text: id => elements.get(id).textContent };
}
test('EMP: 59 infeasible, 60 exact, 61 approximate, 62 nonminimal', () => {
  const h = harness();
  for (const [spend, status] of [[59, 'Too low'], [60, 'Optimal'], [61, 'Near optimal'], [62, 'Not minimal']]) {
    h.set({ empSpend: spend }); h.run('drawExpenditure()');
    assert.equal(h.text('empCost'), '60.00'); assert.equal(h.text('empStatus'), status);
    const texts = h.elements.get('expCanvas').calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    assert.equal(texts.at(-1).includes('tangent'), spend === 60);
    if (spend !== 60) assert.ok(texts.at(-1).startsWith('Selected E ='));
  }
});
test('EMP: three utility types, boundary prices/preferences/targets, and roundoff', () => {
  const h = harness();
  for (const kind of ['cd', 'linear', 'leontief'])
    for (const p1 of [1, 10]) for (const p2 of [1, 10])
      for (const alpha of [0.1, 0.9]) for (const U of [2, 40]) {
        h.run(`empKind = '${kind}'`); h.set({ empP1: p1, empP2: p2, empAlpha: alpha, empU: U });
        const cost = h.run(`expenditureMinSolution('${kind}', ${p1}, ${p2}, ${U}, ${alpha}).cost`);
        for (const [spend, status] of [[cost - 1e-7, 'Too low'], [cost, 'Optimal'], [cost + 1e-7, 'Near optimal'], [cost * (1 + Number.EPSILON), 'Optimal']]) {
          h.set({ empSpend: spend }); h.run('drawExpenditure()');
          assert.equal(h.text('empStatus'), status, `${kind}, ${p1}, ${p2}, ${alpha}, ${U}, ${spend}`);
        }
      }
});
test('Demand Paths: all 116603 slider combinations fit full paths and current point', () => {
  const h = harness();
  for (let ai = 2; ai <= 18; ai++) for (let w = 10; w <= 100; w += 5)
    for (let p1 = 1; p1 <= 10; p1 += 0.5) for (let p2 = 1; p2 <= 10; p2 += 0.5) {
      const a = ai / 20, axes = h.sandbox.demandPathAxes(a, w, p1, p2);
      assert.ok(axes.wealth.xmax > a * 100 / p1 && axes.wealth.ymax > (1 - a) * 100 / p2);
      assert.ok(axes.price.xmax > a * w && axes.price.ymax > (1 - a) * w / p2);
      assert.equal(axes.price.xmax, axes.demand.xmax); assert.ok(axes.demand.ymax > 10);
    }
});
test('Demand Paths: actual canvas markers stay in plot; units and values agree', () => {
  const h = harness();
  h.run('const originalPathLine = drawPathLine; let paths = []; drawPathLine = (...args) => { paths.push(args[5]); originalPathLine(...args); };');
  for (const a of [0.1, 0.9]) for (const w of [10, 100])
    for (const p1 of [1, 10]) for (const p2 of [1, 3, 10]) {
      h.set({ pathAlpha: a, pathW: w, pathP1: p1, pathP2: p2 });
      for (const el of h.elements.values()) el.calls.length = 0;
      h.run('paths = []');
      h.run('drawDemandPaths()');
      assert.equal(h.run('paths[1].at(-1)[0]'), a * w);
      assert.equal(h.run('paths[2].at(-1)[0]'), a * w);
      assert.equal(h.run('paths[2].at(-1)[1]'), 1);
      assert.equal(h.text('pathX1'), (a * w / p1).toFixed(2));
      assert.equal(h.text('pathX2'), ((1 - a) * w / p2).toFixed(2));
      for (const [id, yLabel] of [['pathWealthCanvas', 'x₂'], ['pathPriceCanvas', 'x₂'], ['pathDemandCanvas', 'p₁']]) {
        const calls = h.elements.get(id).calls, dots = calls.filter(c => c[0] === 'arc');
        assert.equal(dots.length, 1); const [, x, y, r] = dots[0];
        assert.ok(x >= 48 && x + r <= 544 && y - r >= 28 && y <= 148, `${id}: ${x},${y}`);
        assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === yLabel));
        for (const c of calls) for (const arg of c.slice(1)) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
      }
    }
});
