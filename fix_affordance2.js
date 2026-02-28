const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/NavigatorSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(
    /<p className="text-gray-600 text-sm md:text-base overflow-hidden">\s*(.*?)\s*<\/p>/sg, 
    function(match, p1) {
        let themeColorText = "indigo-600";
        let themeColorBg = "indigo-100/50";
        let themeColorHover = "indigo-100";
        
        if (p1.includes("срывов")) {
            themeColorText = "amber-600";
            themeColorBg = "amber-100/50";
            themeColorHover = "amber-100";
        } else if (p1.includes("Crash Risk")) {
            themeColorText = "emerald-600";
            themeColorBg = "emerald-100/50";
            themeColorHover = "emerald-100";
        } else if (p1.includes("жиросжигания") || p1.includes("37 парам")) {
            themeColorText = "blue-600";
            themeColorBg = "blue-100/50";
                                         
        }

        return `        return `        return `        return `        return `        return `        return `       xt        return `        return          ${                           return `        return `        return `        return `        return `        rets-        return ` -3 py-1.5        return `        return `     olorHover} text-${themeColorText} text-sm font-medium rounded-xl transition-colors">
                                <span>Узнать подробнее</span>
                                <svg width="14" height="14" viewBox="                                <svg widtor                                <svg width="14keLinejoin="round">
                                                              5 18 9"><                                           </                                                              5 18 9"><                     ileSync(file, txt);
console.log('Affordances updated v2!');
