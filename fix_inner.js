const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/NavigatorSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

// Inside CRS Scale Block - target specifically the paragraph margin ONLY inside the expanded div
txt = txt.replace(
  /<p className="text-gray-600 mb-6 leading-relaxed">\s*Обычные фитнес-приложения сравнивают вас с шаблонным/g, 
  '<p className="text-gray-600 mb-4 leading-relaxed">\n                        Обычные фитнес-приложения сравнивают вас с шаблонным'
);
txt = txt.replace(/<div className="space-y-3">\s*\{crsLevels.map/g, '<div className="space-y-2">\n                        {crsLevels.map');

// Inside Causes Block
txt = txt.replace(
  /<p className="text-gray-600 mb-6 leading-relaxed">\s*Калорий в вакууме не существует./g, 
  '<p className="text-gray-600 mb-4 leading-relaxed">\n        '<p className="text-gra�рий в вакууме не существует.'
);
txt = txt.replace(/<div className="space-y-4">\s*\{causeExamples/g, '<div clastxt = txt.replace(/<div className="spa  {ctxt = txt.replace(/<div className="space-y-4">\s*\{causeExamples/g, '<div clastxt = txt.replaer catxt = txt.replreplatxt = txt.replace(/<div className="space-y-4">\s*\{causeExamples/g, '<div clastxt = txt.replace(/<div className="spa  {ctxt = txt.replace(/<div className="spказано: резкая компенсация/g,
  '<p className="text-gray-600 mb-4 leading-relaxed">\n                        Доказано: резкая компенсаци�  '<p className="text-gray-600 mb-4 leading-relaxed">\n                        Доказано: резкая компенсаци�  '<p c Wa  '<p className="text/<p className="text-gray-600 mb-4 leading-relaxed mt-2">/g, '<p className="text-gray-600 mb-2 leading-relaxed mt-2">');
txt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.replace(/<ptxt = txt.re                          HEYS не гадает.');
txt = txt.replace(/mb-6 bg-white\/50 p-5/g, 'mb-4 bg-white/50 p-4');


fs.writeFileSync(file, txt);
console.log('Fixed only inner gaps!');
