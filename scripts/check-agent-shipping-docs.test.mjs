import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadRepositoryState,
  validateShippingDocumentation,
} from './check-agent-shipping-docs.mjs';

const RUNBOOK = 'docs/operations/AGENT_SHIPPING_RUNBOOK.md';
const INTEGRATE = 'scripts/integrate-agents.mjs';

function withFile(state, file, transform) {
  const files = new Map(state.files);
  files.set(file, transform(files.get(file)));
  return { ...state, files };
}

function invariantFailures(state, invariant) {
  return validateShippingDocumentation(state).failures.filter(
    (failure) => failure.invariant === invariant,
  );
}

test('current shipping documentation and runtime contracts pass', () => {
  const result = validateShippingDocumentation(loadRepositoryState());
  assert.deepEqual(result.failures, []);
});

test('reports a missing local runbook link with a concrete invariant', () => {
  const state = withFile(loadRepositoryState(), RUNBOOK, (text) =>
    text.replace('../../package.json', '../../missing-package.json'),
  );

  const failures = invariantFailures(state, 'markdown-link-exists');
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /missing-package\.json/);
  assert.match(failures[0].fix, /Correct the relative link/);
});

test('reports when the commit-only operation loses --no-push', () => {
  const state = withFile(loadRepositoryState(), RUNBOOK, (text) => {
    const changed = text.replace(
      '`pnpm ship "<conventional message>" --no-push`',
      '`pnpm ship "<conventional message>"`',
    );
    assert.notEqual(changed, text, 'test fixture must remove --no-push');
    return changed;
  });

  const failures = invariantFailures(state, 'commit-only-no-push');
  assert.ok(failures.some((failure) => failure.file === RUNBOOK));
});

test('reports an unknown package command mentioned by the runbook', () => {
  const state = withFile(
    loadRepositoryState(),
    RUNBOOK,
    (text) => `${text}\nUnknown example: \`pnpm missing:shipping\`.\n`,
  );

  const failures = invariantFailures(state, 'package-script-exists');
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /missing:shipping/);
});

test('reports a direct git push added to agents:integrate', () => {
  const state = withFile(
    loadRepositoryState(),
    INTEGRATE,
    (text) => `${text}\nrunRequired('git', ['push', 'origin', 'main']);\n`,
  );

  const failures = invariantFailures(state, 'integration-never-push');
  assert.ok(failures.some((failure) => failure.file === INTEGRATE));
});
