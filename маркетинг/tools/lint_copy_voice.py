#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lint HEYS marketing copy against apps/landing/COPY_VOICE.md blacklist.

Default target is publishable marketing copy, not internal legal/security docs.

Usage:
  python3 маркетинг/tools/lint_copy_voice.py
  python3 маркетинг/tools/lint_copy_voice.py маркетинг/24_Telegram_посты_батч1.md
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGETS = [
    ROOT / 'маркетинг/07_Плейбук_каналов_и_креативы.md',
    ROOT / 'маркетинг/14_Telegram_плейбук.md',
    ROOT / 'маркетинг/17_Бот_лид-магнит_и_онбординг-квиз.md',
    ROOT / 'маркетинг/24_Telegram_посты_батч1.md',
]

FORBIDDEN = [
    'привет',
    'поехали',
    'дожор',
    'плотно',
    'круто',
    'классно',
    'зайдёт',
    'фишка',
    'штука',
    'кидать',
    'скидывать',
    'суперапп',
    'киллер-фича',
    'вау-эффект',
    'продукт-маркет фит',
    'гарантируем',
    'гарантированно',
    '24/7',
    '98% работы',
    'точное AI-распознавание',
    'без срывов навсегда',
    'мы всё сделаем за вас',
    'лечим',
    'диагностируем',
    'терапия',
    'психолог',
    'назначим анализы',
]

FORBIDDEN_PATTERNS = [
    (re.compile(r'(?<![\wА-Яа-яЁё])минус\s+\d+', re.I), 'минус N'),
    (re.compile(r'[-−]\s*\d+\s*кг', re.I), '-N кг'),
]

GUIDE_MARKERS = [
    'нельзя',
    'не писать',
    'не использовать',
    'запрещ',
    'чёрный список',
    'черный список',
    'не обещ',
    'избегать',
    'пример',
    'без «',
    'нет «',
]


def iter_files(paths):
    for path in paths:
        if path.is_dir():
            yield from sorted(path.rglob('*.md'))
            yield from sorted(path.rglob('*.tsx'))
            yield from sorted(path.rglob('*.ts'))
        elif path.exists():
            yield path


def strip_code(line, in_fence):
    if line.strip().startswith('```'):
        return '', not in_fence
    if in_fence:
        return '', in_fence
    return re.sub(r'`[^`]+`', '', line), in_fence


def should_skip(line):
    low = line.lower()
    return line.lstrip().startswith('>') or any(marker in low for marker in GUIDE_MARKERS)


def lint_file(path):
    findings = []
    in_fence = False
    for lineno, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        line, in_fence = strip_code(raw, in_fence)
        if not line or should_skip(line):
            continue
        low = line.lower()
        for phrase in FORBIDDEN:
            pattern = re.compile(
                r'(?<![\wА-Яа-яЁё])' + re.escape(phrase.lower()) + r'(?![\wА-Яа-яЁё])'
            )
            if pattern.search(low):
                findings.append((path, lineno, phrase, raw.strip()))
        for pattern, label in FORBIDDEN_PATTERNS:
            if pattern.search(line):
                findings.append((path, lineno, label, raw.strip()))
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('paths', nargs='*', type=Path)
    args = parser.parse_args()
    targets = args.paths or DEFAULT_TARGETS
    findings = []
    for path in iter_files(targets):
        findings.extend(lint_file(path))

    if findings:
        for path, lineno, phrase, line in findings:
            rel = path.relative_to(ROOT)
            print(f'{rel}:{lineno}: forbidden "{phrase}": {line}')
        return 1
    print('COPY_VOICE lint PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
