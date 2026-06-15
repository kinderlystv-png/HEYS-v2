// kernel-session.test.js — shared session-builder primitives.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_session_v1.js'), 'utf8'));
};

const S = () => globalThis.HEYS.TrainingKernel.session;

describe('TrainingKernel.session', () => {
  beforeAll(setupOnce);

  it('cloneJson and uniq preserve legacy builder behavior', () => {
    const obj = { a: { b: 1 } };
    const copy = S().cloneJson(obj);
    copy.a.b = 2;
    expect(obj.a.b).toBe(1);
    expect(S().uniq(['a', 'b', 'a', '', null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('hasIssueLevel and issueCodes inspect validator output', () => {
    const issues = [{ level: 'ok', code: 'A' }, { level: 'error', code: 'B' }];
    expect(S().hasIssueLevel(issues, 'error')).toBe(true);
    expect(S().issueCodes(issues, 'error')).toEqual(['B']);
  });

  it('seededNoise and rotateBySeed are deterministic', () => {
    expect(S().seededNoise('atom-a', 3)).toBe(S().seededNoise('atom-a', 3));
    expect(S().rotateBySeed(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a']);
    expect(S().rotateBySeed(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b']);
  });

  it('stableSortByScore sorts desc and keeps original order on ties', () => {
    const items = [{ id: 'a', s: 1 }, { id: 'b', s: 3 }, { id: 'c', s: 3 }];
    expect(S().stableSortByScore(items, (x) => x.s).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('stableSortByScore supports asc order for rank-based preferences', () => {
    const items = [{ id: 'a', rank: 2 }, { id: 'b', rank: 0 }, { id: 'c', rank: 0 }];
    expect(S().stableSortByScore(items, (x) => x.rank, 'asc').map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('sortByScoreThenKey uses key tie-break like mobility builder', () => {
    const items = [{ id: 'z', s: 3 }, { id: 'a', s: 3 }, { id: 'b', s: 1 }];
    expect(S().sortByScoreThenKey(items, (x) => x.s, (x) => x.id, 'desc').map((x) => x.id))
      .toEqual(['a', 'z', 'b']);
  });

  it('firstPassing returns first candidate satisfying all predicates', () => {
    const items = [{ id: 'a', safe: false }, { id: 'b', safe: true }, { id: 'c', safe: true }];
    expect(S().firstPassing(items, [(x) => x.safe]).id).toBe('b');
    expect(S().firstPassing(items, [(x) => x.id === 'missing'])).toBeNull();
  });

  it('rankCandidates applies filters, safety issues, score and key tie-break', () => {
    const items = [
      { id: 'z', score: 10, allowed: true },
      { id: 'a', score: 10, allowed: true },
      { id: 'blocked', score: 20, allowed: true },
      { id: 'skip', score: 99, allowed: false }
    ];
    const out = S().rankCandidates(items, {
      filters: [(x) => x.allowed],
      issues: (x) => x.id === 'blocked' ? [{ level: 'error', code: 'blocked' }] : [],
      blockIssue: (issue) => issue.level === 'error',
      score: (x) => x.score,
      candidate: (x, issues, score) => ({ id: x.id, issues, score }),
      key: (x) => x.id,
      direction: 'desc'
    });
    expect(out.map((x) => x.id)).toEqual(['a', 'z']);
  });

  it('buildPipeline runs slots through candidates, gates, scoring, materialization and trace', () => {
    const slots = [{ id: 'warmup', block: 'A' }, { id: 'main', block: 'B' }];
    const atoms = {
      A: [{ id: 'a2', score: 2, safe: true }, { id: 'a1', score: 2, safe: true }],
      B: [{ id: 'b_bad', score: 9, safe: false }, { id: 'b_ok', score: 1, safe: true }]
    };
    const out = S().buildPipeline(slots, {
      candidates: (slot) => atoms[slot.block],
      issues: (atom) => atom.safe ? [] : [{ level: 'error', code: 'blocked' }],
      blockIssue: (issue) => issue.level === 'error',
      score: (atom) => atom.score,
      candidate: (atom, issues, score) => ({ atom, issues, score }),
      key: (candidate) => candidate.atom.id,
      materialize: (candidate, slot) => ({ slot: slot.id, atomId: candidate.atom.id }),
      trace: ({ slot, candidates, picked }) => ({
        slot: slot.id,
        picked: picked && picked.atom.id,
        candidateCount: candidates.length
      })
    });
    expect(out.items).toEqual([
      { slot: 'warmup', atomId: 'a1' },
      { slot: 'main', atomId: 'b_ok' }
    ]);
    expect(out.trace).toEqual([
      { slot: 'warmup', picked: 'a1', candidateCount: 2 },
      { slot: 'main', picked: 'b_ok', candidateCount: 1 }
    ]);
  });
});
