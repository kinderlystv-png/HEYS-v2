#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_DIR = resolve(ROOT, 'docs/reference');
const SYSTEMS_DIR = resolve(REFERENCE_DIR, 'systems');
const markdownFiles = [];

function collectMarkdownFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const target = resolve(directory, entry);
    if (statSync(target).isDirectory()) {
      collectMarkdownFiles(target);
    } else if (target.endsWith('.md')) {
      markdownFiles.push(target);
    }
  }
}

function parseLocalLink(rawLink) {
  const link = rawLink.trim().replace(/^<|>$/g, '');
  if (!link || /^(?:https?:|mailto:)/i.test(link)) return null;

  const hashIndex = link.indexOf('#');
  const filePart = hashIndex === -1 ? link : link.slice(0, hashIndex);
  const anchorPart = hashIndex === -1 ? '' : link.slice(hashIndex + 1);

  return {
    filePart: decodeURIComponent(filePart),
    anchorPart: decodeURIComponent(anchorPart).toLowerCase(),
  };
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();

  for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-');
    const duplicateIndex = seen.get(base) ?? 0;
    seen.set(base, duplicateIndex + 1);
    anchors.add(duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`);
  }

  return anchors;
}

function factsTableIds(markdown) {
  const lines = markdown.split('\n');
  const factsStart = lines.findIndex((line) => /^## Facts Table(?:\s|$)/.test(line));
  if (factsStart === -1) return [];

  const factsEnd = lines.findIndex((line, index) => index > factsStart && /^##\s+/.test(line));
  const section = lines.slice(factsStart + 1, factsEnd === -1 ? undefined : factsEnd);
  const headerIndex = section.findIndex((line) => /^\|\s*ID\s*\|/i.test(line));
  if (headerIndex === -1) return [];

  return section
    .slice(headerIndex + 2)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1]?.trim().replace(/`/g, ''))
    .filter(Boolean);
}

collectMarkdownFiles(REFERENCE_DIR);

const brokenLinks = [];
const structureErrors = [];
const duplicateIdErrors = [];
const fixedLineWarnings = [];
let checkedLinks = 0;
const markdownCache = new Map();

for (const file of markdownFiles) {
  const markdown = readFileSync(file, 'utf8');
  markdownCache.set(file, markdown);
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(linkPattern)) {
    const localLink = parseLocalLink(match[1]);
    if (!localLink) continue;

    checkedLinks += 1;
    const targetFile = resolve(dirname(file), localLink.filePart || relative(dirname(file), file));
    const line = markdown.slice(0, match.index).split('\n').length;

    if (!existsSync(targetFile)) {
      brokenLinks.push(`${relative(ROOT, file)}:${line} -> ${match[1]}`);
      continue;
    }

    if (localLink.anchorPart && targetFile.endsWith('.md')) {
      const targetMarkdown = markdownCache.get(targetFile) ?? readFileSync(targetFile, 'utf8');
      markdownCache.set(targetFile, targetMarkdown);
      if (!headingAnchors(targetMarkdown).has(localLink.anchorPart)) {
        brokenLinks.push(`${relative(ROOT, file)}:${line} -> ${match[1]} (missing anchor)`);
      }
    }
  }

  const fixedLineCount = [...markdown.matchAll(/sed\s+-n\s+['"][0-9]/g)].length;
  if (fixedLineCount > 0) fixedLineWarnings.push([relative(ROOT, file), fixedLineCount]);

  const ids = factsTableIds(markdown);
  const seenIds = new Set();
  for (const id of ids) {
    if (seenIds.has(id)) duplicateIdErrors.push(`${relative(ROOT, file)} -> ${id}`);
    seenIds.add(id);
  }
}

const dossierFiles = markdownFiles.filter(
  (file) => dirname(file) === SYSTEMS_DIR && file !== resolve(SYSTEMS_DIR, 'README.md'),
);

for (const file of dossierFiles) {
  const markdown = markdownCache.get(file);
  const firstSectionEnd = markdown.indexOf('\n## ');
  const passport = firstSectionEnd === -1 ? markdown : markdown.slice(0, firstSectionEnd);
  const normalizedPassport = passport.replace(/<br>\s*/gi, '\n> ').replace(/^>\s*>\s*/gm, '> ');
  const missing = [];

  if (!/^>\s*(?:\*\*)?Статус(?:\*\*)?:/m.test(normalizedPassport)) missing.push('Статус');
  if (!/^>\s*(?:\*\*)?Охват(?:\*\*)?:/m.test(normalizedPassport)) missing.push('Охват');
  if (!/^>\s*(?:\*\*)?Не (?:подтверждено|охвачено)(?:\*\*)?:/m.test(normalizedPassport)) {
    missing.push('Не подтверждено/Не охвачено');
  }
  if (!/^## Facts Table(?:\s|$)/m.test(markdown)) missing.push('Facts Table');

  if (missing.length > 0) {
    structureErrors.push(`${relative(ROOT, file)} -> missing ${missing.join(', ')}`);
  }
}

const errorCount = brokenLinks.length + structureErrors.length + duplicateIdErrors.length;

if (errorCount > 0) {
  console.error(`Reference check failed (${errorCount} errors):`);
  for (const link of brokenLinks) console.error(`- ${link}`);
  for (const error of structureErrors) console.error(`- ${error}`);
  for (const error of duplicateIdErrors) console.error(`- duplicate Facts Table ID: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Reference OK: ${checkedLinks} local links, ${dossierFiles.length} dossier passports, no duplicate IDs.`,
  );
}

const fixedLineTotal = fixedLineWarnings.reduce((sum, [, count]) => sum + count, 0);
if (fixedLineTotal > 0) {
  console.warn(
    `Reference warning: ${fixedLineTotal} fixed line-range checks in ${fixedLineWarnings.length} files; replace when touched.`,
  );
  if (process.argv.includes('--verbose')) {
    for (const [file, count] of fixedLineWarnings) console.warn(`- ${file}: ${count}`);
  }
}
