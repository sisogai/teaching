// Run: node --test tests/*.test.cjs (no added dependencies).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../micro_chapter5_partial_equilibrium.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function draw(params = {}, area = 'none', monopoly = false) {
  const elements = {}, axes = [], dots = [], fills = [];
  const ctx = new Proxy({}, {get: (o,k) => o[k] || (() => {}), set: (o,k,v) => (o[k]=v,true)});
  for (const m of html.matchAll(/<(input|select|canvas)[^>]*id="([^"]+)"[^>]*>/g)) {
    elements[m[2]] = {value: m[0].match(/value="([^"]+)"/)?.[1] || 'none', dataset:{}, style:{},
      getContext: () => ctx, getAttribute: n => n === 'width' ? '500' : '420'};
  }
  for(const [id,value] of Object.entries(params)) elements[id].value = String(value);
  const context = vm.createContext({document:{getElementById: id => elements[id] ||= {}, querySelectorAll: () => []}, window:{devicePixelRatio:2, addEventListener(){}}, axes,dots,fills});
  vm.runInContext(script + `
    const originalSetup = setupCanvas;
    setupCanvas = (...args) => { axes.push(args.slice(1)); return originalSetup(...args); };
    const originalDot = dot;
    dot = (...args) => { dots.push(args.slice(1,3)); return originalDot(...args); };
    const originalFill = fillBetween;
    fillBetween = (...args) => { fills.push(args.slice(3,7)); return originalFill(...args); };
    ${monopoly ? 'monopolyArea' : 'policyArea'} = '${area}';
    ${monopoly ? 'drawMonopoly' : 'drawPolicy'}();`, context);
  return {elements,axes,dots,fills};
}
function near(a,b,t=0.011) {assert.ok(Math.abs(Number(a)-b)<t, `${a} ≈ ${b}`);}
function out(r,id){return r.elements[id].textContent;}
test('default equilibrium and tax wedge with positive trade',()=>{
  let r=draw(); near(out(r,'qPolicyOut'),80/1.8); near(out(r,'dwlPolicyOut'),0);
  r=draw({policy:'tax',policySize:14}); near(out(r,'qPolicyOut'),66/1.8);
  near(Number(out(r,'pcPolicyOut'))-Number(out(r,'ppPolicyOut')),14);
  near(out(r,'dwlPolicyOut'),0.5*14*14/1.8);
});
test('cap 30 keeps correct efficient-rationing values and explains bounds',()=>{
  const r=draw({policy:'cap',policySize:30},'cs');
  near(out(r,'qPolicyOut'),25); near(out(r,'csPolicyOut'),1187.5); near(out(r,'dwlPolicyOut'),340.277777);
  assert.match(out(r,'policyText'),/efficient rationing.*upper bound.*lower bound.*lottery or queues/);
});
test('tax below, at, and above prohibitive threshold',()=>{
  for(const size of [79.5,80,80.5,100]) {
    const r=draw({policy:'tax',policySize:size},'dwl');
    const q=Math.max(0,(80-size)/1.8);
    near(out(r,'qPolicyOut'),q);
    near(out(r,'dwlPolicyOut'),0.5*1.8*(80/1.8-q)**2);
    if(size>=80) {
      assert.equal(out(r,'pcPolicyOut'),'No trade'); assert.equal(out(r,'ppPolicyOut'),'No trade');
      near(out(r,'csPolicyOut'),0); near(out(r,'psPolicyOut'),0); assert.equal(r.dots.length,1);
      assert.match(out(r,'policyText'),/reservation prices.*not transaction prices/);
    }
  }
});
test('floor/cap inactive, binding, and zero-trade boundaries',()=>{
  for(const [policy,size,q] of [['cap',100,80/1.8],['floor',0,80/1.8],['cap',10,0],['cap',0,0],['floor',90,0],['floor',100,0],['floor',60,30]]) {
    const r=draw({policy,policySize:size}); near(out(r,'qPolicyOut'),q);
    if(q===0) assert.equal(out(r,'pcPolicyOut'),'No trade');
  }
});
test('Q240/P48 regression and monopoly share adaptive nonnegative axes',()=>{
  const r=draw({pa:120,pb:0.3,pc:0,pd:0.2}); near(out(r,'qPolicyOut'),240); near(out(r,'pcPolicyOut'),48);
  assert.ok(r.axes[0][0]>240);
  const m=draw({ma:120,mb:0.3,mc:0,md:0.2},'dwl',true);
  near(out(m,'qcOut'),240); near(out(m,'qmOut'),150); assert.ok(m.axes[0][0]>240);
});
test('permitted slider corners: all modes, areas, finite stats, visible points and surplus endpoints (1088 draws)',()=>{
  let count=0;
  for(const a of [40,120]) for(const b of [0.3,2.5]) for(const c of [0,40]) for(const d of [0.2,2.5])
    for(const policy of ['none','tax','cap','floor']) for(const size of [0,40,80,100]) for(const area of ['none','cs','ps','dwl']) {
      const r=draw({pa:a,pb:b,pc:c,pd:d,policy,policySize:size},area); count++;
      const [qx,py]=r.axes[0]; assert.ok(qx>0 && py>0); assert.equal(r.axes[0].length,2); // defaults xMin=yMin=0
      for(const [x,y] of r.dots) assert.ok(x>=0 && x<qx && y>=0 && y<py);
      for(const [x0,x1,top,bottom] of r.fills) for(const x of [x0,x1]) {
        assert.ok(x>=0 && x<qx); assert.ok(top(x)>=0 && top(x)<py); assert.ok(bottom(x)>=0 && bottom(x)<py);
      }
      for(const id of ['qPolicyOut','csPolicyOut','psPolicyOut','dwlPolicyOut']) assert.ok(Number.isFinite(Number(out(r,id))) && Number(out(r,id))>=0);
    }
  assert.equal(count,1024);
  // Repeat every corner across monopoly's four shaded states (64 more draws).
  for(const a of [40,120]) for(const b of [0.3,2.5]) for(const c of [0,40]) for(const d of [0.2,2.5]) for(const area of ['none','cs','ps','dwl']) {
    const r=draw({ma:a,mb:b,mc:c,md:d},area,true); const [qx,py]=r.axes[0];
    for(const [x,y] of r.dots) assert.ok(x>=0 && x<qx && y>=0 && y<py);
  }
});
test('area shading follows numeric DWL integral, including tax100',()=>{
  for(const size of [14,79.5,80,100]) {
    const r=draw({policy:'tax',policySize:size},'dwl'); const [lo,hi,top,bottom]=r.fills[0];
    near(out(r,'dwlPolicyOut'),(hi-lo)*((top(lo)-bottom(lo))+(top(hi)-bottom(hi)))/2);
  }
});
test('English limitations, controls labeled, no invented subsidy mode',()=>{
  assert.match(html,/positive trade/); assert.match(html,/entire competitive total surplus/); assert.match(html,/opportunity|time and resources/);
  for(const id of ['policy','pa','pb','pc','pd','policySize','ma','mb','mc','md']) assert.ok(html.includes(`label for="${id}"`));
  assert.doesNotMatch(html,/<option value="subsidy"/);
});
