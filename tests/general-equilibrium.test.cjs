// Run with node --test tests/*.test.cjs; no additional dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(process.env.CHAPTER6_HTML || path.join(__dirname, '../micro_chapter6_general_equilibrium.html'), 'utf8');
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
function harness() {
  const elements = new Map();
  for (const [, tag, id] of html.matchAll(/(<[^>]*\bid="([^"]+)"[^>]*>)/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const calls = [], listeners = {};
    const ctx = new Proxy({}, { get: (obj, key) => obj[key] || ((...args) => calls.push([key, ...args])) });
    const el = { ...attrs, style: {}, dataset: {}, calls, textContent: '', listeners,
      getAttribute: key => attrs[key], getContext: () => ctx,
      addEventListener: (event, fn) => { listeners[event] = fn; } };
    // Reproduce HTML range value sanitization, including its step lattice.
    let value = attrs.value || '';
    Object.defineProperty(el, 'value', { get: () => value, set: input => {
      let x = Number(input);
      if (attrs.type === 'range') {
        x = Math.max(+el.min, Math.min(+el.max, x));
        if (el.step !== 'any') x = +el.min + Math.round((x - el.min) / el.step) * el.step;
      }
      value = String(x);
    } });
    elements.set(id, el);
  }
  const sandbox = vm.createContext({ document: { getElementById: id => elements.get(id) },
    window: { devicePixelRatio: 1, addEventListener() {} } });
  vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1], sandbox);
  return { elements, run: code => vm.runInContext(code, sandbox),
    set: values => { for (const [id, value] of Object.entries(values)) elements.get(id).value = value; },
    text: id => elements.get(id).textContent };
}
test('contract curve equates both MRS for all 5041 preference pairs and reaches both origins', () => {
  const h = harness();
  for (let i = 15; i <= 85; i++) for (let j = 15; j <= 85; j++) {
    const a1 = i / 100, a2 = j / 100;
    near(h.run(`contractCurveY(0,${a1},${a2},10,10)`), 0);
    near(h.run(`contractCurveY(10,${a1},${a2},10,10)`), 10);
    for (const x of [0.1, 2.5, 5, 7.5, 9.9]) {
      const y = h.run(`contractCurveY(${x},${a1},${a2},10,10)`);
      assert.ok(y > 0 && y < 10);
      near(a1 / (1 - a1) * y / x, a2 / (1 - a2) * (10 - y) / (10 - x));
      if (i === j) near(y, x);
    }
  }
});
test('Show equilibrium preserves exact price, clears both goods, and lands on contract curve', () => {
  const h = harness(); h.run('initPage()');
  for (const a1 of [0.15, 0.45, 0.85]) for (const a2 of [0.15, 0.65, 0.85])
    for (const wx of [0, 3.5, 10]) for (const wy of [0, 6, 10]) {
      h.set({ alpha1: a1, alpha2: a2, wx1: wx, wy1: wy });
      h.elements.get('showEq').listeners.click();
      const p = +h.elements.get('price').value;
      near(p, (a1 * wy + a2 * (10 - wy)) / (10 - a1 * wx - a2 * (10 - wx)));
      const x1 = a1 * (p * wx + wy) / p, y1 = (1 - a1) * (p * wx + wy);
      const x2 = a2 * (p * (10 - wx) + 10 - wy) / p, y2 = (1 - a2) * (p * (10 - wx) + 10 - wy);
      near(x1 + x2, 10); near(y1 + y2, 10);
      near(h.run(`contractCurveY(${x1},${a1},${a2},10,10)`), y1);
      assert.equal(h.text('excessOut'), '0 (clears)');
    }
});
test('regression .15 shares: exact 3/17 survives repeated clicks and manual input stays live', () => {
  const h = harness(); h.run('initPage()'); h.set({ alpha1: 0.15, alpha2: 0.15 });
  for (let i = 0; i < 3; i++) {
    h.elements.get('showEq').listeners.click();
    near(+h.elements.get('price').value, 3 / 17, 1e-15);
    assert.equal(h.text('priceOut'), '0.18');
    assert.equal(h.text('excessOut'), '0 (clears)');
  }
  h.set({ price: 0.18 }); h.elements.get('price').listeners.input();
  assert.equal(h.text('excessOut'), '-0.17');
  h.set({ price: 3 / 17 + 1e-6 }); h.elements.get('price').listeners.input();
  assert.notEqual(h.text('excessOut'), '0 (clears)');
  assert.notEqual(h.text('excessOut'), '0');
  h.set({ alpha1: 0.85 }); h.elements.get('alpha1').listeners.input();
  assert.notEqual(h.text('excessOut'), '0 (clears)');
  h.elements.get('showEq').listeners.click(); assert.equal(h.text('excessOut'), '0 (clears)');
});
test('drawn contract curve uses the MRS solution and all coordinates are finite', () => {
  const h = harness();
  h.run('const oldPath = drawPath; let curve; drawPath = (...args) => { if (args[5] === colors.green) curve = args[1].map(x => [x, args[2](x)]); oldPath(...args); }; drawBox();');
  for (const [x, y] of h.run('curve')) near(0.45 / 0.55 * y / x, 0.65 / 0.35 * (10 - y) / (10 - x));
  for (const call of h.elements.get('boxCanvas').calls) for (const arg of call.slice(1)) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
});
