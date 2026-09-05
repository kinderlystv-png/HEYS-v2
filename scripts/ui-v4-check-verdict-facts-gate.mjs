#!/usr/bin/env node
// Gate wrapper: ratchet на протухшие факты «=» + scope/remainder.

import { pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import { inspectVerdictFacts } from './ui-v4-check-verdict-facts.mjs';

// 05.09 recount: полоса 5 + short CSS module refs (NNN:line).
const BASELINE = Object.freeze({
  staleCount: 26,
  staleDigest: 'ca3c1c601bfc1eac',
});

function runCli() {
  const report = inspectVerdictFacts(readAllZones());

  console.log(
    `Факты вердиктов «=»: ${report.equalsRows} строк; разобрано ${report.parsedRows} ` +
      `(${report.parseRate}%); остаток без file:line: ${report.unparsedRows}.`,
  );
  console.log(
    `Охват: проверено ${report.factsChecked} ссылок, ${report.anchorsChecked} якорей; ` +
      `протухло ${report.staleCount} (digest ${report.staleDigest}).`,
  );

  if (report.staleCount > BASELINE.staleCount) {
    console.error(
      `\n❌ Протухшие факты выросли: было ${BASELINE.staleCount}, стало ${report.staleCount}.`,
    );
    for (const item of report.stale.slice(0, 8)) {
      const anchor = item.anchors ? ` · ${item.anchors.join(', ')}` : '';
      console.error(`  ${item.kind} · ${item.zoneId} · ${item.rel}:${item.line}${anchor} · «${item.key}»`);
    }
    if (report.stale.length > 8) console.error(`  … ещё ${report.stale.length - 8}`);
    process.exitCode = 1;
    return;
  }

  if (report.staleCount < BASELINE.staleCount) {
    console.log(
      `\nДолг уменьшился (${BASELINE.staleCount} → ${report.staleCount}) — ` +
        'обновите BASELINE в ui-v4-check-verdict-facts-gate.mjs:',
    );
    console.log(`  staleCount: ${report.staleCount}`);
    console.log(`  staleDigest: '${report.staleDigest}'`);
  } else if (report.staleDigest !== BASELINE.staleDigest && report.staleCount === BASELINE.staleCount) {
    console.log(
      `\nСостав протухших изменился при том же числе — обновите staleDigest: '${report.staleDigest}'`,
    );
  } else {
    console.log('Факты в пределах заморозки gate: рост протухших не допускается.');
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
