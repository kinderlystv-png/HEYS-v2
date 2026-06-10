// Merge-gate тесты для B-2 / B-3. Грузит РЕАЛЬНЫЕ модули и проверяет 5 гейтов.
// Запуск: node review/caloric-methodology-audit/test_calc_gates.cjs
const fs = require('fs');
const path = require('path');
const WEB = path.resolve(__dirname, '../../apps/web');
global.window = global; // IIFE-модули цепляются к window===global

function load(f) { eval(fs.readFileSync(path.join(WEB, f), 'utf8')); }
load('heys_tef_v1.js');
load('heys_tdee_v1.js');
load('heys_day_calculations.js');

const TDEE = global.HEYS.TDEE;
const computeDailyNorms = global.HEYS.dayCalculations.computeDailyNorms;
const ATW = global.HEYS.TEF.ATWATER;

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { (cond?pass++:fail++); console.log(`${cond?'✅':'❌ FAIL'} ${name}${extra?'  '+extra:''}`); };
const approx = (a, b, eps=1) => Math.abs(a - b) <= eps;

console.log('ATWATER =', JSON.stringify(ATW), '\n');

// ─── Gate 1 + 4: reconciliation нормы (prot*3 + carbs*4 + fat*9 == K) ───
console.log('— Gate 1/4: reconciliation computeDailyNorms —');
const splits = [
  { proteinPct: 30, carbsPct: 40 }, { proteinPct: 25, carbsPct: 45 },
  { proteinPct: 40, carbsPct: 30 }, { proteinPct: 18, carbsPct: 52 },
];
for (const K of [1500, 2000, 2750]) {
  for (const s of splits) {
    const n = computeDailyNorms(K, s);
    const back = n.prot * ATW.protein + n.carbs * ATW.carbs + n.fat * ATW.fat;
    ok(`K=${K} P${s.proteinPct}/C${s.carbsPct}: back-sum=${back.toFixed(1)} == K`, approx(back, K, 1),
       `(prot=${n.prot.toFixed(1)}г carbs=${n.carbs.toFixed(1)}г fat=${n.fat.toFixed(1)}г)`);
  }
}

// ─── Gate 2/3: BMR overload + gender/sex синонимы ───
console.log('\n— Gate 2/3: calcBMR overload + gender/sex —');
const mifflin = (w,h,a,fem) => Math.round(10*w + 6.25*h - 5*a + (fem ? -161 : 5));
const posF = TDEE.calcBMR(80, { gender:'Женский', height:175, age:30 });   // positional
const objG = TDEE.calcBMR({ weight:80, height:175, age:30, gender:'Женский' }); // overload gender
const objS = TDEE.calcBMR({ weight:80, height:175, age:30, sex:'female' });     // overload sex synonym
const posM = TDEE.calcBMR(80, { gender:'Мужской', height:175, age:30 });
ok('positional Ж == Mifflin(−161)', posF === mifflin(80,175,30,true), `${posF} vs ${mifflin(80,175,30,true)}`);
ok('overload {gender:Женский} == positional', objG === posF, `${objG} vs ${posF}`);
ok('overload {sex:female} == positional Ж', objS === posF, `${objS} vs ${posF}`);
ok('positional М == Mifflin(+5)', posM === mifflin(80,175,30,false), `${posM} vs ${mifflin(80,175,30,false)}`);
ok('overload даёт >0 (была мёртвая делегация → 0)', objG > 0 && objS > 0, `objG=${objG} objS=${objS}`);

// эмуляция вызова user_v12 (height в метрах → ×100) — как в правке
const w=72, hM=1.68, a=34;
const userV12Bmr = TDEE.calcBMR(w, { gender:'Женский', height: hM*100, age: a });
ok('user_v12-style call == Mifflin', userV12Bmr === mifflin(w, hM*100, a, true), `${userV12Bmr} vs ${mifflin(w,hM*100,a,true)}`);

// ─── Gate: жир в норме теперь /9 (был баг /8 в отчётах) ───
console.log('\n— Gate: жир норма /9 (фикс /8) —');
const n2 = computeDailyNorms(2000, { proteinPct:30, carbsPct:40 }); // fatPct=30 → 600 ккал /9 = 66.7г
ok('fat норма = K*fatPct/9', approx(n2.fat, 2000*0.30/9, 0.1), `fat=${n2.fat.toFixed(2)}г (ожидание ${(2000*0.3/9).toFixed(2)})`);

// ─── Итог ───
console.log(`\n${'='.repeat(40)}\nИТОГО: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
