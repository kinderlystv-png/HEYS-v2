import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/hooks/block-subagent-push.mjs');

function runHook(command, agentId = 'agent-1') {
  return spawnSync('node', [SCRIPT_PATH], {
    input: JSON.stringify({
      agent_id: agentId,
      tool_input: { command },
    }),
    encoding: 'utf8',
  });
}

describe('block subagent push hook', () => {
  it('blocks direct git push from subagents', () => {
    const result = runHook('git push origin main');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Subagent push заблокирован');
  });

  it('blocks pnpm push wrappers, pnpm ship, and integration from subagents', () => {
    for (const command of [
      'pnpm push:agent -- --confirm-push --title="x"',
      'pnpm push:safe -- --dry-run',
      'pnpm push:ready',
      'pnpm ship "fix(sync): x"',
      'pnpm agents:integrate --confirm-integration --branches=codex/a --title=x --items=[]',
    ]) {
      const result = runHook(command);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('pnpm push:* / pnpm ship / pnpm agents:integrate');
    }
  });

  it('allows main-session commands because explicit user approval is handled there', () => {
    const result = runHook('pnpm push:agent -- --confirm-push --title="x"', '');

    expect(result.status).toBe(0);
  });
});
