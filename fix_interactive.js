const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/NavigatorSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

// 1. Initial State
txt = txt.replace('useState<number>(0)', 'useState<number>(-1)');

function replaceChevron(txt, color, bgIntensity) {
    const searchString = `<div className={\`mt-1.5 transition-transform duration-500 flex-shrink-0 bg-${color}-${bgIntensity}/50 rounded-full p-2 \${isOpen ? 'rotate-180' : 'rotate-0'}\`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-${color}-600">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>`;
                
    const replaceString = `<div className="flex flex-col items-end gap-1 mt-1 sm:mt-0 flex-shrink-0">
                    <div className={\`flex items-cen                    <div classNup-h                    <ditra                    <div className={\`flex items-cen                    <div classNup-h                er                    <div className={\`fdur               Open                     <div className={\`flex items-cen            </span>
                        <div className={\`tran                        <div className={\`tran                        <div className={\`tran                        <div className={\`tran                        <div className={\`tra="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9">                                <polyline points="6 9 12 15 18 9">     </div>
                    </div>
                <                                 <                                 <                                 <                '100');
txt = replaceChevron(txt, 'emerald', '100');
txt = replaceChevron(txt, 'amber', '100');
txt = replaceChevron(txt, 'sky', '100');

fs.writeFileSync(file, txt);
console.log('Script finished');
