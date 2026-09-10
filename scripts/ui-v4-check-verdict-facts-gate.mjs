#!/usr/bin/env node
// Gate wrapper: ratchet на протухшие факты «=» + scope/remainder.

import { pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import { classifyVerdictFacts } from './ui-v4-classify-verdict-facts.mjs';
import { inspectVerdictFacts } from './ui-v4-check-verdict-facts.mjs';

// 05.09 recount: полоса 5 + short CSS module refs (NNN:line).
// 10.09: протухших якорей стало 3 из 4 — одна ссылка закрылась вместе со
// строкой, которую переписал пакет 52.
const BASELINE = Object.freeze({
  staleCount: 3,
  staleDigest: 'b1deb49343486225',
});

// 08.09 settings-system tail: −17 unparsed (gate-ref + svg + alias + soleNavKey + touch).
// 10.09 пакеты 51 и 52: 8787 → 8728, все четыре корзины ужались. Прогрессом это
// не является — строки не разобрали, их переписал дизайнер, вердикты снялись в
// «?», и вместе с «=» из счёта ушли их факты. Порог затянут, потому что храповик
// считает текущее состояние, а не наши заслуги.
const CLASSIFIER_BASELINE = Object.freeze({
  unparsedRows: 8728,
  buckets: Object.freeze({ a: 1482, b: 3241, c: 2338, g: 1658 }),
  digest: 'ebafe4fd1f4cf57e',
});

function runCli() {
  const report = inspectVerdictFacts(readAllZones());
  const classified = classifyVerdictFacts(readAllZones());

  console.log(
    `Факты вердиктов «=»: ${report.equalsRows} строк; разобрано ${report.parsedRows} ` +
      `(${report.parseRate}%); остаток без file:line: ${report.unparsedRows}.`,
  );
  console.log(
    `Классификация остатка: (a) ${classified.buckets.a} · (b) ${classified.buckets.b} · ` +
      `(c) ${classified.buckets.c} · (g) ${classified.buckets.g}.`,
  );
  console.log(
    `Охват: проверено ${report.factsChecked} ссылок, ${report.anchorsChecked} якорей; ` +
      `протухло ${report.staleCount} (digest ${report.staleDigest}).`,
  );

  if (classified.digest !== CLASSIFIER_BASELINE.digest) {
    console.error(
      `\n❌ Классификатор остатка разошёлся с baseline (digest ${CLASSIFIER_BASELINE.digest} → ${classified.digest}).`,
    );
    console.error(
      `  unparsed ${CLASSIFIER_BASELINE.unparsedRows} → ${classified.unparsedRows}; ` +
        `buckets a ${CLASSIFIER_BASELINE.buckets.a}→${classified.buckets.a} ` +
        `b ${CLASSIFIER_BASELINE.buckets.b}→${classified.buckets.b} ` +
        `c ${CLASSIFIER_BASELINE.buckets.c}→${classified.buckets.c} ` +
        `g ${CLASSIFIER_BASELINE.buckets.g}→${classified.buckets.g}`,
    );
    process.exitCode = 1;
    return;
  }

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
