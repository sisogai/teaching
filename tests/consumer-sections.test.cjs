const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '../micro_chapter4_consumer_theory.html'), 'utf8');

test('Chapter 4 sections, subsection labels, and navigation match the notes', () => {
  const comp = html.indexOf('id="comparative-analysis"');
  const emp = html.indexOf('id="expenditure-minimization"');
  assert.ok(comp >= 0 && emp > comp);
  const compHTML = html.slice(comp, emp);
  const empHTML = html.slice(emp, html.indexOf('COLAB LINK', emp));
  assert.match(compHTML, /4\.5 Comparative Analysis of Demand Functions/);
  for (const n of [1, 2, 3]) assert.match(compHTML, new RegExp(`4\\.5\\.${n} —`));
  assert.doesNotMatch(compHTML, /4\.6\./);
  assert.match(empHTML, /4\.6 Expenditure Minimization Problem/);
  assert.match(empHTML, /Definition 4\.6\.1 — Expenditure Minimization Problem/);
  for (const id of ['comparative-analysis', 'expenditure-minimization']) {
    assert.match(html, new RegExp(`href="#${id}"`));
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, fragment] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(fragment));
});
