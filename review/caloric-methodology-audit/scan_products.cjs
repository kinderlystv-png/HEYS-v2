// Data-quality scan of the HEYS shared product catalog.
// Replicates computeDerivedProduct (models:581) net-Atwater kcal and looks for
// edge cases that affect the intake side of the caloric algorithm.
const fs = require('fs');
const path = require('path');
const ROOT = '/sessions/zen-nice-goldberg/mnt/HEYS-v2';

const file = process.argv[2] || path.join(ROOT, 'heys_shared_products_export_backup.json');
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const products = Array.isArray(j) ? j : (j.products || j.data || j.rows || []);
console.log(`FILE: ${path.basename(file)}  | meta: ${JSON.stringify(j._meta || {}).slice(0,160)}`);
console.log(`TOTAL products: ${products.length}\n`);

const num = v => (+v || 0);
// net Atwater (как в models:581)
const kcalNet = p => 3*num(p.protein100) + 4*(num(p.carbs100)||(num(p.simple100)+num(p.complex100))) + 9*(num(p.fat100)||(num(p.badFat100)+num(p.goodFat100)+num(p.trans100)));
const kcalGross = p => 4*num(p.protein100) + 4*(num(p.carbs100)||(num(p.simple100)+num(p.complex100))) + 9*(num(p.fat100)||(num(p.badFat100)+num(p.goodFat100)+num(p.trans100)));
const macroSum = p => num(p.protein100)+num(p.carbs100)+num(p.simple100)+num(p.complex100)+num(p.fat100)+num(p.badFat100)+num(p.goodFat100)+num(p.trans100);

// 0) есть ли вообще stored kcal100 / агрегаты в данных?
const withStoredKcal = products.filter(p => p.kcal100 != null);
const withStoredFat = products.filter(p => p.fat100 != null);
const withStoredCarbs = products.filter(p => p.carbs100 != null);
console.log('=== Stored aggregate fields (конфликт gross/net возможен только если они есть) ===');
console.log(`  c kcal100: ${withStoredKcal.length} | c fat100: ${withStoredFat.length} | c carbs100: ${withStoredCarbs.length}`);
if (withStoredKcal.length) {
  // сравнить stored vs net
  let diffs = withStoredKcal.map(p => ({name:p.name, stored:num(p.kcal100), net:Math.round(kcalNet(p)), gross:Math.round(kcalGross(p))}))
    .map(x => ({...x, dStoredNet: x.stored - x.net}));
  const big = diffs.filter(x => Math.abs(x.dStoredNet) >= 10).sort((a,b)=>Math.abs(b.dStoredNet)-Math.abs(a.dStoredNet));
  console.log(`  продуктов где stored kcal100 расходится с net на >=10 ккал: ${big.length}`);
  big.slice(0,12).forEach(x => console.log(`    ${x.name}: stored=${x.stored} net=${x.net} gross=${x.gross} (Δstored-net=${x.dStoredNet})`));
}
console.log('');

// 1) V-1a: продукты, которые дадут 0 ккал (все макросы нулевые/пустые)
const zeroKcal = products.filter(p => Math.round(kcalNet(p)) === 0);
console.log(`=== V-1a: продукты с 0 ккал (нет макросов) → молча обнулятся в mealTotals: ${zeroKcal.length} ===`);
zeroKcal.slice(0,25).forEach(p => console.log(`    "${p.name}" [cat=${p.category||'—'}] macroSum=${macroSum(p)}`));
if (zeroKcal.length>25) console.log(`    … ещё ${zeroKcal.length-25}`);
console.log('');

// 2) Подозрительно низкие (<25 ккал/100г) но не нулевые — алкоголь/специи/недозаполненные
const lowKcal = products.filter(p => { const k=Math.round(kcalNet(p)); return k>0 && k<25; });
console.log(`=== Подозрительно низкие 1..24 ккал/100г: ${lowKcal.length} ===`);
lowKcal.slice(0,20).forEach(p => console.log(`    "${p.name}" net=${Math.round(kcalNet(p))} [cat=${p.category||'—'}]`));
console.log('');

// 3) Алкоголь: этанол (7 ккал/г) не входит в макросы → недосчёт
const alcoRe = /(пиво|вино|водк|виск|конья|ром\b|джин|текил|ликёр|ликер|бренди|шампан|сидр|алко|beer|wine|vodka|whisk|brandy|liqueur|cocktail|коктейл|настойк|самог|спирт)/i;
const alco = products.filter(p => alcoRe.test(p.name||''));
console.log(`=== Алкоголь (этанол не в Atwater-макросах → системный недосчёт): ${alco.length} ===`);
alco.slice(0,20).forEach(p => console.log(`    "${p.name}" net=${Math.round(kcalNet(p))} ккал/100г (реально пиво ~40, вино ~85, крепкое ~230)`));
console.log('');

// 4) Сколько калорий каталога приходится на белок (часть, затронутая 3 vs 4)
let totProtKcalNet=0, totKcalNet=0, totKcalGross=0, sumProt=0;
products.forEach(p => { totProtKcalNet += 3*num(p.protein100); totKcalNet += kcalNet(p); totKcalGross += kcalGross(p); sumProt += num(p.protein100); });
console.log('=== Вклад белка (ось net 3 vs gross 4) по каталогу ===');
console.log(`  средний белок: ${(sumProt/products.length).toFixed(1)} г/100г`);
console.log(`  доля «белковых» ккал в net-сумме каталога: ${(100*totProtKcalNet/totKcalNet).toFixed(1)}%`);
console.log(`  net-сумма vs gross-сумма каталога: ${Math.round(totKcalNet)} vs ${Math.round(totKcalGross)} (gross выше на ${(100*(totKcalGross-totKcalNet)/totKcalNet).toFixed(1)}%)`);
console.log('');

// 5) Аномалии: отрицательные/гигантские макросы, kcal > 900
const weird = products.filter(p => macroSum(p) > 100 || Math.round(kcalNet(p)) > 902 || num(p.protein100)<0 || num(p.fat100)<0 || (num(p.simple100)+num(p.complex100))>100 || num(p.protein100)>100);
console.log(`=== Аномалии (макросумма >100г/100г, kcal>902, отрицательные): ${weird.length} ===`);
weird.slice(0,15).forEach(p => console.log(`    "${p.name}" net=${Math.round(kcalNet(p))} prot=${num(p.protein100)} carb=${(num(p.carbs100)||num(p.simple100)+num(p.complex100))} fat=${(num(p.fat100)||num(p.badFat100)+num(p.goodFat100)+num(p.trans100))} macroSum=${macroSum(p).toFixed(0)}`));
console.log('');

// 6) Покрытие полей
const haveProt = products.filter(p=>p.protein100!=null).length;
const haveGI = products.filter(p=>p.gi!=null).length;
const haveHarm = products.filter(p=>p.harm!=null).length;
const haveCat = products.filter(p=>p.category!=null && p.category!=='').length;
console.log('=== Покрытие полей ===');
console.log(`  protein100: ${haveProt}/${products.length} | gi: ${haveGI} | harm: ${haveHarm} | category: ${haveCat}`);
