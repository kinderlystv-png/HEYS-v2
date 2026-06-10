// Second-pass numerical verification of HEYS caloric methodology.
// Loads the REAL canonical modules (heys_tef_v1, heys_tdee_v1) and replicates
// alternate code paths verbatim from verified source lines.
const fs = require('fs');
const path = require('path');
const WEB = path.join(__dirname, '..', '..', 'apps', 'web');

// --- Load real canonical modules into Node global (their IIFE targets `global` when window is undefined) ---
function load(f) { eval(fs.readFileSync(path.join(WEB, f), 'utf8')); }
load('heys_tef_v1.js');
load('heys_tdee_v1.js');
const TDEE = global.HEYS.TDEE;
const TEF = global.HEYS.TEF;
console.log('Loaded modules:', { TDEE: !!TDEE, TEF: !!TEF, tefVer: TEF.VERSION });

// --- Verbatim replicas of ALTERNATE paths (from verified source lines) ---
// user_v12.js:898-900  (Harris-Benedict / Roza-Shizgal, mislabeled "Mifflin")
function bmrHarrisBenedict(w, hCm, age, gender) {
  return gender === 'Женский'
    ? 447.593 + 9.247 * w + 3.098 * hCm - 4.330 * age
    : 88.362 + 13.397 * w + 4.799 * hCm - 5.677 * age;
}
// user_v12.js:927  steps (stride 0.7 m, coef 0.5/0.57)
function stepsKcal_userv12(steps, w, gender) {
  return (steps || 0) * 0.7 / 1000 * w * (gender === 'Женский' ? 0.5 : 0.57);
}
// user_v12.js:922 / day_utils:825  net-MET training (flat -1 kcal/min)
function trainKcal_net(zoneMin, w, mets = [2.5, 6, 8, 10]) {
  let k = 0;
  zoneMin.forEach((min, i) => { k += (min || 0) * ((mets[i] * w * 0.0175) - 1); });
  return k;
}
// ⚠️ PRE-FIX демонстратор (намеренно /4): показывает баг B-2 до фикса 2026-06-10.
// «ProteinNorm gap: SHORT …» в выводе — НЕ регрессия. Живой код (norm /3) проверяет
// test_calc_gates.cjs на реальном computeDailyNorms.
function normProteinGrams(optimum, protPct) { return (optimum * protPct) / 4; }
// models/metabolic intake: protein at *3 (NET Atwater)
function intakeKcal_net(protG, carbG, fatG) { return protG * 3 + carbG * 4 + fatG * 9; }
// gross intake reference (food-label style 4/4/9)
function intakeKcal_gross(protG, carbG, fatG) { return protG * 4 + carbG * 4 + fatG * 9; }

const R = x => Math.round(x);
function pct(a, b) { return b ? ((a - b) / b * 100).toFixed(1) + '%' : 'n/a'; }

// --- Synthetic profiles ---
const profiles = [
  { name: 'P1 Ж сидячая', gender: 'Женский', age: 30, weight: 65, height: 165,
    day: { steps: 8000, trainings: [], householdMin: 0, deficitPct: 0 },
    eaten: { prot: 90, carbs: 200, fat: 60 } },
  { name: 'P2 М активный', gender: 'Мужской', age: 35, weight: 90, height: 182,
    day: { steps: 12000, trainings: [{ z: [0, 20, 30, 10] }], householdMin: 0, deficitPct: -15 },
    eaten: { prot: 180, carbs: 250, fat: 80 } },
  { name: 'P3 Ж умеренная', gender: 'Женский', age: 45, weight: 78, height: 170,
    day: { steps: 6000, trainings: [{ z: [0, 30, 0, 0] }], householdMin: 30, deficitPct: -20 },
    eaten: { prot: 120, carbs: 150, fat: 55 } },
];

for (const p of profiles) {
  const prof = { age: p.age, weight: p.weight, height: p.height, gender: p.gender,
                 deficitPctTarget: p.day.deficitPct };
  const dayMacros = { prot: p.eaten.prot, carbs: p.eaten.carbs, fat: p.eaten.fat };
  const res = TDEE.calculate(p.day, prof, { dayMacros, includeNDTE: false });

  // BMR divergence
  const bmrM = TDEE.calcBMR(p.weight, prof);                 // real Mifflin (canonical)
  const bmrHB = R(bmrHarrisBenedict(p.weight, p.height, p.age, p.gender)); // profile path

  // Steps divergence
  const stepsCanon = res.stepsKcal;                          // canonical (stride 1.19m)
  const stepsAlt = R(stepsKcal_userv12(p.day.steps, p.weight, p.gender)); // profile (0.7m)

  // Training divergence (gross canonical vs net alt)
  const trZ = (p.day.trainings[0] && p.day.trainings[0].z) || [0,0,0,0];
  const trGross = res.trainingsKcal;
  const trNet = R(trainKcal_net(trZ, p.weight));

  // Intake divergence (net protein vs gross)
  const eNet = R(intakeKcal_net(p.eaten.prot, p.eaten.carbs, p.eaten.fat));
  const eGross = R(intakeKcal_gross(p.eaten.prot, p.eaten.carbs, p.eaten.fat));

  // Protein norm gap: grams targeted at /4 but counted at *3
  const protPct = 0.25;
  const protG = normProteinGrams(res.optimum, protPct);
  const protKcalAllocated = res.optimum * protPct;          // allocated in norm
  const protKcalCounted = protG * 3;                         // counted on intake
  const protGap = R(protKcalAllocated - protKcalCounted);

  // Balance: app (eaten - optimum) vs physiologically-correct (eaten_net - tdee_with_TEF)
  const balApp = eNet - res.optimum;
  const tdeeWithTEF = res.tdee;                              // base + TEF (+NDTE off)
  const balTrue = eNet - tdeeWithTEF;                        // correct given net-protein intake
  const tefCarbFat = res.tefKcal;

  console.log('\n==================== ' + p.name + ' ====================');
  console.log(`BMR:        Mifflin=${bmrM}  HarrisBenedict=${bmrHB}  Δ=${bmrHB - bmrM} (${pct(bmrHB, bmrM)})`);
  console.log(`Steps:      canon(1.19m)=${stepsCanon}  alt(0.7m)=${stepsAlt}  Δ=${stepsCanon - stepsAlt} (${pct(stepsCanon, stepsAlt)})`);
  console.log(`Training:   gross=${trGross}  net=${trNet}  Δ=${trGross - trNet} (double-counted rest)`);
  console.log(`Household:  kcal=${res.householdKcal} (gross MET 2.5)`);
  console.log(`actTotal=${res.actTotal}  baseExpenditure(noTEF)=${res.baseExpenditure}  TDEE(+TEF)=${res.tdee}  carb/fatTEF=${tefCarbFat}`);
  console.log(`optimum(target, from baseExp, deficit ${p.day.deficitPct}%)=${res.optimum}`);
  console.log(`Intake:     net(prot*3)=${eNet}  gross(prot*4)=${eGross}  Δ=${eGross - eNet} (protein TEF baked in)`);
  console.log(`ProteinNorm gap: target ${protG.toFixed(0)}g → allocated ${R(protKcalAllocated)} kcal but counted ${R(protKcalCounted)} kcal → SHORT ${protGap} kcal`);
  console.log(`Balance:    app(eaten-optimum)=${balApp >= 0 ? '+' : ''}${R(balApp)}   true(eaten-TDEEwithTEF)=${balTrue >= 0 ? '+' : ''}${R(balTrue)}   bias=${R(balApp - balTrue)} kcal (carb/fat TEF excluded from target)`);
}

// --- Protein net-energy sanity: is 3 kcal/g a coherent "TEF baked in" value? ---
console.log('\n==================== Protein net-energy check ====================');
console.log('Atwater ME protein = 4 kcal/g; protein TEF ~25%  => net = 4*(1-0.25) = ' + (4*0.75) + ' kcal/g  (matches code 3)');
console.log('Carb  ME=4, TEF 7.5% => net = ' + (4*0.925).toFixed(2) + ' kcal/g  (code keeps 4, adds TEF to expenditure)');
console.log('Fat   ME=9, TEF 1.5% => net = ' + (9*0.985).toFixed(3) + ' kcal/g  (code keeps 9, adds TEF to expenditure)');
console.log('=> protein uses NET-energy model; carb/fat use ME+expenditure-TEF model. Asymmetric but each internally defensible.');
