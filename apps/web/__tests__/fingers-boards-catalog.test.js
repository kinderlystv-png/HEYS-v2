// fingers-boards-catalog.test.js — board catalog integrity.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const src = fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_boards_catalog_v1.js'), 'utf8');
  // eslint-disable-next-line no-eval
  eval(src);
};

const F = () => globalThis.HEYS.Fingers;

describe('boards catalog integrity', () => {
  beforeAll(setupOnce);

  it('board ids are unique, so BOARDS_BY_ID does not overwrite entries', () => {
    const ids = F().BOARDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(F().BOARDS_BY_ID).sort()).toEqual(ids.slice().sort());
  });

  it('keeps Lattice fingerboard and Lattice hang block as separate boards', () => {
    const fingerboard = F().getBoardById('lattice_block');
    const hangBlock = F().getBoardById('lattice_hang_block');

    expect(fingerboard).toMatchObject({
      id: 'lattice_block',
      label: 'Lattice Tension Block'
    });
    expect(fingerboard.kind || 'fingerboard').toBe('fingerboard');

    expect(hangBlock).toMatchObject({
      id: 'lattice_hang_block',
      kind: 'block',
      label: 'Lattice Hang Block'
    });
  });

  it('normalizes legacy blockBoardId lattice_block to the portable block only in block context', () => {
    expect(F().getBoardById('lattice_block').kind || 'fingerboard').toBe('fingerboard');
    expect(F().normalizeBlockBoardId('lattice_block')).toBe('lattice_hang_block');
    expect(F().getBoardById(F().normalizeBlockBoardId('lattice_block'))).toMatchObject({
      id: 'lattice_hang_block',
      kind: 'block'
    });
    expect(F().normalizeBlockBoardId('xclimb_terminator')).toBe('xclimb_terminator');
  });

  it('getBoardsByKind separates full fingerboards from portable blocks', () => {
    const fullBoards = F().getBoardsByKind('fingerboard');
    const blocks = F().getBoardsByKind('block');

    expect(fullBoards.some((b) => b.id === 'lattice_block')).toBe(true);
    expect(fullBoards.some((b) => b.id === 'lattice_hang_block')).toBe(false);
    expect(blocks.some((b) => b.id === 'lattice_hang_block')).toBe(true);
    expect(blocks.some((b) => b.id === 'lattice_block')).toBe(false);
  });
});
