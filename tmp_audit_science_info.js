const fs = require('fs');
const vm = require('vm');

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const hasSourceLike = (v) => hasOwn(v, 'source') || hasOwn(v, 'sources') || hasOwn(v, 'pmid');

function runInWindow(path) {
    const code = fs.readFileSync(path, 'utf8');
    const sandbox = { window: {}, console };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: path });
    return sandbox.window;
}

const constantsPath = '/Users/poplavskijanton/HEYS-v2/apps/web/insights/pi_constants.js';
const sciencePath = '/Users/poplavskijanton/HEYS-v2/apps/web/insights/pi_science_info.js';

const wA = runInWindow(constantsPath);
const wB = runInWindow(sciencePath);

const A = wA.HEYS.InsightsPI.constants.SCIENCE_INFO;
const B = wB.HEYS.InsightsPI.science;

function audit(obj) {
    const keys = Object.keys(obj);
    return {
        missingShort: keys.filter((k) => !hasOwn(obj[k], 'short')).sort(),
        missingDetails: keys.filter((k) => !hasOwn(obj[k], 'details')).sort(),
        missingSource: keys.filter((k) => !hasSourceLike(obj[k])).sort()
    };
}

const keysA = new Set(Object.keys(A));
const keysB = new Set(Object.keys(B));
const onlyInA = [...keysA].filter((k) => !keysB.has(k)).sort();
const onlyInB = [...keysB].filter((k) => !keysA.has(k)).sort();

const inBoth = [...keysA].filter((k) => keysB.has(k)).sort();
const presenceMismatches = [];
for (const k of inBoth) {
    const a = A[k];
    const b = B[k];
    const miss = [];
    if (hasOwn(a, 'short') !== hasOwn(b, 'short')) miss.push('short');
    if (hasOwn(a, 'details') !== hasOwn(b, 'details')) miss.push('details');
    if (hasSourceLike(a) !== hasSourceLike(b)) miss.push('source');
    if (miss.length) presenceMismatches.push(`${k}:${miss.join('|')}`);
}

const out = {
    constants: audit(A),
    science: audit(B),
    diff: {
        onlyInConstants: onlyInA,
        onlyInScience: onlyInB,
        presenceMismatches
    }
};

process.stdout.write(JSON.stringify(out, null, 2));
