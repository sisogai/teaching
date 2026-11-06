// Run with node --test tests/*.test.cjs; no additional dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(process.env.CHAPTER7_HTML || path.join(__dirname, '../micro_chapter7_market_failure.html'), 'utf8');
const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
function harness() {
  const elements = new Map();
  for (const [, tag, id] of html.matchAll(/(<[^>]*\bid="([^"]+)"[^>]*>)/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const calls = [];
    const ctx = new Proxy({}, { get: (obj, key) => obj[key] || ((...args) => calls.push([key, ...args])) });
    elements.set(id, { ...attrs, style: {}, dataset: {}, calls, textContent: '',
      getAttribute: key => attrs[key], getContext: () => ctx, addEventListener() {} });
  }
  const sandbox = vm.createContext({ document: { getElementById: id => elements.get(id), querySelectorAll: () => [] },
    window: { devicePixelRatio: 1, addEventListener() {} } });
  vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1], sandbox);
  vm.runInContext(`const oldFill = fillBetween, oldDot = dot, oldPath = drawPath;
    let areas = [], dots = [], demand;
    fillBetween = (...args) => { areas.push(args); oldFill(...args); };
    dot = (...args) => { dots.push(args); oldDot(...args); };
    drawPath = (...args) => { if (args[5] === colors.blue) demand = args[2]; oldPath(...args); };`, sandbox);
  return { elements, run: code => vm.runInContext(code, sandbox),
    set: values => { for (const [id, value] of Object.entries(values)) elements.get(id).value = String(value); },
    text: id => elements.get(id).textContent };
}
function draw(h, values, area = 'dwl') {
  h.set(values); h.run(`areas = []; dots = []; externalArea = '${area}'; drawExternality();`);
}
function shadedArea(h) {
  const args = h.run('areas[0]'); if (!args) return 0;
  const [, , , x0, x1, top, bottom] = args;
  // The linear gap integrates exactly by a trapezoid.
  return (x1 - x0) * (top(x0) - bottom(x0) + top(x1) - bottom(x1)) / 2;
}
test('positive externality regression: social point and WL use negative linear marginal value', () => {
  const h = harness(); draw(h, { ea: 40, eb: 2.5, ec: 0, ed: 0.2, em: -30 });
  assert.equal(h.text('qPrivateOut'), '14.81'); assert.equal(h.text('qSocialOut'), '25.93');
  assert.equal(h.text('wlExternalOut'), '166.67');
  const social = h.run("dots.find(args => args[5] === 'social')");
  near(social[1], 70 / 2.7); near(social[2], 40 - 2.5 * social[1]);
  near(social[2], 0.2 * social[1] - 30); assert.ok(social[2] < 0);
  near(h.run('demand(20)'), -10); near(shadedArea(h), 500 / 3);
  const area = h.run('areas[0]'); near(area[5](social[1]), area[6](social[1]));
  const yPixel = social[4](social[2]); assert.ok(yPixel > 22 && yPixel < 378);
  const calls = h.elements.get('externalCanvas').calls;
  assert.ok(calls.some(c => c[0] === 'clip'));
});
test('positive, zero, negative, and prohibitive external costs match shaded and reported welfare', () => {
  const h = harness();
  for (const a of [40, 90, 120]) for (const b of [0.3, 1, 2.5])
    for (const c of [0, 10, 40]) for (const d of [0.2, 0.6, 2.5]) for (const m of [-30, 0, 12, 40]) {
      draw(h, { ea: a, eb: b, ec: c, ed: d, em: m });
      const qp = Math.max(0, (a - c) / (b + d)), qs = Math.max(0, (a - c - m) / (b + d));
      const W = q => (a - c - m) * q - 0.5 * (b + d) * q * q;
      const expected = Math.max(0, W(qs) - W(qp));
      near(shadedArea(h), expected);
      near(+h.text('wlExternalOut'), expected, 0.00500001);
      const social = h.run("dots.find(args => args[5] === 'social')");
      near(social[1], qs); near(social[2], a - b * qs);
      if (qs > 0) near(social[2], c + d * qs + m);
      for (const id of ['qPrivateOut', 'qSocialOut', 'taxOut', 'csExternalOut', 'psExternalOut', 'wlExternalOut']) assert.ok(Number.isFinite(+h.text(id)));
      h.elements.get('externalCanvas').calls.length = 0;
    }
});
test('all area modes remain consistent; repeated switching restores the requested shading', () => {
  const h = harness(), values = { ea: 40, eb: 2.5, ec: 0, ed: 0.2, em: -30 };
  for (const mode of ['cs', 'ps', 'none', 'dwl', 'none', 'cs']) {
    draw(h, values, mode);
    if (mode === 'none') assert.equal(h.run('areas.length'), 0);
    else near(shadedArea(h), +h.text(mode === 'cs' ? 'csExternalOut' : mode === 'ps' ? 'psExternalOut' : 'wlExternalOut'), 0.00500001);
  }
});
test('the teaching text states the negative marginal-value and nonnegative-quantity assumptions', () => {
  assert.match(html, /linear inverse demand curve continues below zero/);
  assert.match(html, /negative marginal value means consumers need compensation/);
  assert.match(html, /Q_\{\\text\{social\}\} = \\max/);
});
