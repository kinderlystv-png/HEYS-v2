const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/NavigatorSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(
  /className={`rounded-\[2rem\] bg-indigo-50\/40 border border-indigo-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer/g,
  'className={`group rounded-[2rem] bg-indigo-50/40 border border-indigo-100 hover:bg-indigo-50/80 hover:border-indigo-200 hover:shadow-md p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer'
);

txt = txt.replace(
  /className={`rounded-\[2rem\] bg-emerald-50\/40 border border-emerald-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer/g,
  'className={`group rounded-[2rem] bg-emerald-50/40 border border-emerald-100 hover:bg-emerald-50/80 hover:border-emerald-200 hover:shadow-md p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer'
);

txt = txt.replace(
  /className={`rounded-\[2rem\] bg-amber-50\/40 border bor  /className={`rounded-\[2rem\] bgn-  /className={`rounded-\t   /className={`rounded-\[2rem\] bg-amber-50\/40 border bor  /className={`rounded-\[2rem\] bgn-  /classNmb  /className={`rounded-\[2rem00 hover:shad  /className={`rotr  /className={`rounded-\[2rem\] bg-amber-50\/40 border bor  /className={`rounded-\[2rem\] bgn-  /className={`rounded-\t   /className={`ro-10  /className={`rounded-\[2rem\] bg-amber-50\/40 border bor  /className={`rounded-\[2rem\] bgn-  /className={`rounded-\t   /className={`rounded-\[2rem\] bg-amber-50\/40 border bor  /className={`rounded-:p-6 t  /className={`rration-700 ease-out cursor-pointer'
);

fs.writeFileSync(file, txt);
console.log('Added group hover effects');
