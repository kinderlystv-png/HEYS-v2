#!/usr/bin/env node
// Проверяет CSS-стражи в Vitest, которые используют `\{[\s\S]*?…`.
// Такая регулярка выглядит как проверка одного правила, но не ограничена `}`:
// свойство из любого следующего правила может дать ложный зелёный результат.
//
// Скрипт не запрещает [\s\S] вообще: он находит только expect(css).toMatch()
// и expect(css).not.toMatch(), где css прочитан из реального .css-файла,
// затем измеряет фактическое совпадение. Если оно прошло первую закрывающую
// скобку правила, доказательство считается недействительным.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.join(ROOT, 'apps/web/__tests__');
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const WIDE_GAP = '[\\s\\S]*?';
const NESTED_CSS_SCOPE_RE = /@(?:container|keyframes|media|supports)\b/;

function collectTestFiles(dir = TEST_ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(full, out);
    else if (TEST_FILE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function propertyName(node) {
  return ts.isPropertyAccessExpression(node) ? node.name.text : '';
}

function callOwner(node) {
  return ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : null;
}

function isNamedCall(node, name) {
  return ts.isCallExpression(node) && propertyName(node.expression) === name;
}

function evaluatePathExpression(node, bindings, testFile) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) {
    if (node.text === '__dirname') return path.dirname(testFile);
    return bindings.get(node.text) || null;
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const method = node.expression.name.text;
  if (method !== 'join' && method !== 'resolve') return null;
  const args = node.arguments.map((arg) => evaluatePathExpression(arg, bindings, testFile));
  if (args.some((arg) => typeof arg !== 'string')) return null;
  return method === 'join' ? path.join(...args) : path.resolve(...args);
}

function pathBindings(sourceFile, testFile) {
  const declarations = [];
  visit(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.push(node);
    }
  });
  const bindings = new Map();
  for (let pass = 0; pass < declarations.length + 1; pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      if (bindings.has(declaration.name.text)) continue;
      const value = evaluatePathExpression(declaration.initializer, bindings, testFile);
      if (typeof value !== 'string') continue;
      bindings.set(declaration.name.text, value);
      changed = true;
    }
    if (!changed) break;
  }
  return bindings;
}

function findReadCssPath(initializer, bindings, testFile) {
  let found = null;
  visit(initializer, (node) => {
    if (found || !isNamedCall(node, 'readFileSync')) return;
    const candidate = evaluatePathExpression(node.arguments[0], bindings, testFile);
    if (typeof candidate === 'string' && candidate.toLowerCase().endsWith('.css')) found = candidate;
  });
  return found;
}

function cssBindings(sourceFile, testFile) {
  const bindings = pathBindings(sourceFile, testFile);
  const css = [];
  visit(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const cssPath = findReadCssPath(node.initializer, bindings, testFile);
    if (!cssPath || !fs.existsSync(cssPath)) return;
    let scope = node.parent;
    while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
    css.push({
      name: node.name.text,
      start: node.getStart(sourceFile),
      scope,
      cssPath,
      source: fs.readFileSync(cssPath, 'utf8'),
    });
  });
  return css;
}

function resolveCssBinding(bindings, name, assertionNode) {
  const at = assertionNode.getStart();
  return bindings
    .filter(
      (binding) =>
        binding.name === name &&
        binding.start < at &&
        binding.scope &&
        binding.scope.getStart() <= at &&
        binding.scope.end >= assertionNode.end,
    )
    .sort((left, right) => {
      const leftSpan = left.scope.end - left.scope.getStart();
      const rightSpan = right.scope.end - right.scope.getStart();
      return leftSpan - rightSpan || right.start - left.start;
    })[0];
}

function regexParts(node) {
  if (!node || !ts.isRegularExpressionLiteral(node)) return null;
  const text = node.getText();
  const close = text.lastIndexOf('/');
  if (close <= 0) return null;
  return { source: text.slice(1, close), flags: text.slice(close + 1) };
}

function assertionSubject(node) {
  if (!isNamedCall(node, 'toMatch')) return null;
  let owner = callOwner(node);
  let negated = false;
  if (ts.isPropertyAccessExpression(owner) && owner.name.text === 'not') {
    negated = true;
    owner = owner.expression;
  }
  if (!ts.isCallExpression(owner) || !ts.isIdentifier(owner.expression)) return null;
  if (owner.expression.text !== 'expect' || owner.arguments.length !== 1) return null;
  const subject = owner.arguments[0];
  if (!ts.isIdentifier(subject)) return null;
  return { name: subject.text, negated };
}

export function classifyCssGuard(regex, cssSource) {
  const wideAt = regex.source.indexOf(WIDE_GAP);
  if (wideAt < 0) return { kind: 'not-wide' };
  const openAt = regex.source.lastIndexOf('\\{', wideAt);
  if (openAt < 0) return { kind: 'not-rule-shaped' };
  if (NESTED_CSS_SCOPE_RE.test(regex.source.slice(0, openAt))) return { kind: 'nested-scope' };

  const flags = regex.flags.replaceAll('g', '').replaceAll('y', '');
  let compiled;
  try {
    compiled = new RegExp(regex.source, flags);
  } catch (error) {
    return { kind: 'invalid', error: error.message };
  }
  const match = compiled.exec(cssSource);
  if (!match) return { kind: 'no-match' };
  const blockOpen = match[0].indexOf('{');
  const blockClose = blockOpen < 0 ? -1 : match[0].indexOf('}', blockOpen + 1);
  return {
    kind: blockClose >= 0 ? 'crosses-rule' : 'bounded-now',
    match: match[0],
  };
}

export function scanCssTestGuards(testRoot = TEST_ROOT) {
  const results = [];
  for (const testFile of collectTestFiles(testRoot)) {
    const testSource = fs.readFileSync(testFile, 'utf8');
    const sourceFile = ts.createSourceFile(
      testFile,
      testSource,
      ts.ScriptTarget.Latest,
      true,
      testFile.endsWith('.ts') || testFile.endsWith('.tsx') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    const cssByName = cssBindings(sourceFile, testFile);
    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) return;
      const subject = assertionSubject(node);
      const regex = regexParts(node.arguments[0]);
      const css = subject && resolveCssBinding(cssByName, subject.name, node);
      if (!subject || !regex || !css || !regex.source.includes(WIDE_GAP)) return;
      const state = classifyCssGuard(regex, css.source);
      if (state.kind === 'not-wide' || state.kind === 'not-rule-shaped') return;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      results.push({
        file: path.relative(ROOT, testFile).replaceAll('\\', '/'),
        line,
        cssFile: path.relative(ROOT, css.cssPath).replaceAll('\\', '/'),
        negated: subject.negated,
        regex,
        ...state,
      });
    });
  }
  return results;
}

function runCli() {
  const results = scanCssTestGuards();
  const risky = results.filter((item) => item.kind === 'crosses-rule');
  const bounded = results.filter((item) => item.kind === 'bounded-now');
  const noMatch = results.filter((item) => item.kind === 'no-match');
  const nested = results.filter((item) => item.kind === 'nested-scope');

  console.log(
    `CSS-стражи с [\\s\\S]*?: внутри правила ${bounded.length}, перескочили } ${risky.length}, ` +
      `сейчас не совпали ${noMatch.length}, вложенный scope ${nested.length}.`,
  );

  const verbose = process.argv.includes('--list');
  if (verbose || risky.length) {
    for (const item of risky) {
      console.error(
        `  ${item.file}:${item.line} → ${item.cssFile} (${item.negated ? 'not.toMatch' : 'toMatch'})`,
      );
      console.error(`    /${item.regex.source}/${item.regex.flags}`);
    }
  }
  if (verbose && noMatch.length) {
    console.log('\nСейчас не совпадают (норма для not.toMatch, красный сигнал для toMatch):');
    for (const item of noMatch) {
      console.log(`  ${item.file}:${item.line} (${item.negated ? 'not.toMatch' : 'toMatch'})`);
    }
  }

  if (risky.length && !verbose) {
    console.error('\nИсправьте проверку: извлеките одно CSS-правило через `[^}]*` или отдельный helper.');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
