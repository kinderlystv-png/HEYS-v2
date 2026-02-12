import fs from 'node:fs';

const files = {
  constants: '/Users/poplavskijanton/HEYS-v2/apps/web/insights/pi_constants.js',
  science: '/Users/poplavskijanton/HEYS-v2/apps/web/insights/pi_science_info.js'
};

function parseScienceInfo(filePath) {
  const s = fs.readFileSync(filePath, 'utf8');
  const marker = 'const SCIENCE_INFO = {';
  const i = s.indexOf(marker);
  if (i === -1) throw new Error(`SCIENCE_INFO marker not found in ${filePath}`);

  const start = s.indexOf('{', i);
  let depth = 0;
  let inStr = false;
  let quote = '';
  let esc = false;
  let end = -1;

  for (let p = start; p < s.length; p++) {
    const ch = s[p];

    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === quote) {
        inStr = false;
        quote = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      quote = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = p;
        break;
      }
    }
  }

  if (end === -1) throw new Error(`SCIENCE_INFO closing brace not found in ${filePath}`);

  const body = s.slice(start + 1, end);

  const keyRegex = /\n\s*([A-Z0-9_]+)\s*:\s*\{/g;
  const keys = [];
  let m;
  while ((m = keyRegex.exec(body))) {
    keys.push({ key: m[1], idx: m.index });
  }

  return keys.map((entry, index) => {
    const from = entry.idx;
    const to = index + 1 < keys.length ? keys[index + 1].idx : body.length;
    const segment = body.slice(from, to);
    const has = (f) => new RegExp(`\\b${f}\\s*:`).test(segment);

    return {
      key: entry.key,
      short: has('short'),
      details: has('details'),
      sourceLike: has('source') || has('sources') || has('pmid') || has('url')
    };
  });
}

function diffPresence(aList, bList, field) {
  const aSet = new Set(aList.filter((x) => x[field]).map((x) => x.key));
  const bSet = new Set(bList.filter((x) => x[field]).map((x) => x.key));

  const onlyA = [...aSet].filter((k) => !bSet.has(k)).sort();
  const onlyB = [...bSet].filter((k) => !aSet.has(k)).sort();

  return {
    constantsPresent: aSet.size,
    sciencePresent: bSet.size,
    diff: onlyA.length + onlyB.length,
    onlyInConstants: onlyA,
    onlyInScience: onlyB
  };
}

const constants = parseScienceInfo(files.constants);
const science = parseScienceInfo(files.science);

const cKeys = constants.map((x) => x.key);
const sKeys = science.map((x) => x.key);
const cSet = new Set(cKeys);
const sSet = new Set(sKeys);

const onlyInConstants = cKeys.filter((k) => !sSet.has(k)).sort();
const onlyInScience = sKeys.filter((k) => !cSet.has(k)).sort();

const out = {
  counts: {
    constantsKeys: cKeys.length,
    scienceKeys: sKeys.length,
    commonKeys: cKeys.filter((k) => sSet.has(k)).length
  },
  diffPresence: {
    short: diffPresence(constants, science, 'short'),
    details: diffPresence(constants, science, 'details'),
    sourceLike: diffPresence(constants, science, 'sourceLike')
  },
  onlyInConstants,
  onlyInScience
};

process.stdout.write(JSON.stringify(out));
