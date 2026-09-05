import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectVerdictFacts } from '../../../scripts/ui-v4-check-verdict-facts.mjs';

const tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-facts-'));
  tmpDirs.push(dir);
  const cssDir = path.join(dir, 'apps/web/styles/modules');
  fs.mkdirSync(cssDir, { recursive: true });
  const css = path.join(cssDir, 'sample.css');
  const lines = ['.alive { color: red; }', '.gone { color: blue; }', '', '.moved { margin: 0; }'];
  fs.writeFileSync(css, lines.join('\n'));
  return { dir, css: 'apps/web/styles/modules/sample.css' };
}

describe('inspectVerdictFacts', () => {
  it('counts unparsed = rows without file:line', () => {
    const report = inspectVerdictFacts({
      zones: {
        demo: {
          rows: {
            plain: { v: '=', f: 'только проза без адреса' },
            coded: { v: '=', f: 'sample.css:1 .alive' },
          },
        },
      },
    });
    expect(report.equalsRows).toBe(2);
    expect(report.parsedRows).toBe(1);
    expect(report.unparsedRows).toBe(1);
  });

  it('does not mark anchor stale when line drifted but name remains in file', () => {
    const { dir, css } = fixtureTree();
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const report = inspectVerdictFacts({
        zones: {
          demo: {
            rows: {
              drift: { v: '=', f: `${css}:99 .moved` },
            },
          },
        },
      });
      expect(report.staleCount).toBe(0);
    } finally {
      process.chdir(cwd);
    }
  });

  it('marks anchor absent when identifier left the file', () => {
    const { dir, css } = fixtureTree();
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const report = inspectVerdictFacts({
        zones: {
          demo: {
            rows: {
              gone: { v: '=', f: `${css}:2 .vanished-class` },
            },
          },
        },
      });
      expect(report.staleCount).toBe(1);
      expect(report.stale[0].kind).toBe('absent');
    } finally {
      process.chdir(cwd);
    }
  });
});
