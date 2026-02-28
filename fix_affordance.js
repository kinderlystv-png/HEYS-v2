const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/NavigatorSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

// The replacement logic:
// We need to find the `overflow-hidden` blocks inside the FIRST grid (which is the collapsed preview).
// But wait, my previous scripts made the text <p> overflow-hidden, or the wrapper?
// Let's check how it's actually written:
// <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 mt-2'}`}>
//      <p className="text-gray-600 text-sm md:text-base overflow-hidden"> ... </p>
// </div>

txt = txt.replace(/<p className="text-gray-600 text-sm md:text-base overflow-hidden">\s*(.*?)\s*<\/p>/g, function(match, p1) {
    // Determine the color based on the text to match the right block
    let themeColorText = "indigo-600";
    let themeColorBg = "indigo-100/50";
    let themeColorHover = "indigo-100";
    
    
et themeColorHover = "indig��et themeColorHover = " {
                                                                                                     = "amber-100";
    } else if (p1.includes("По    } else if (p1.includи    } else if (p1.includes("По    } else if (p1.includи    } else if (p1.includes("По    } else        } else if (p1.includes("По    } else if (p1.includи    } else if (p1.includ считать БЖУ")) {
        themeColorText = "blue-700";
        themeColorBg = "blue-100/50";
        themeColorHover = "blue-100";
    }

    return `<div className="overflow-hidd    return `<div className="overflow-hidd    return `<div className="overflow-hidd>
                                                                                                               me="inline-flex mt-4 items-center gap-1.5 px-3 py-1.5 bg-${themeColorBg} hover:bg-${themeColorHover} text-${themeColorText} text-sm font                                      ">                                    an>Узнать подробнее</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </div>`;
});

// Write it back
fs.writeFileSync(file, txt);
console.log('Affordances updated!');
