#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build weekly funnel report from anonymized marketing events.

Input CSV/JSON rows may contain:
source, campaign, event, occurred_at, spend_rub, revenue_rub

Events expected by маркетинг/18:
lead, quiz_start, quiz_complete, week_request, trial_active, payment, renewal.

Usage:
  python3 маркетинг/tools/build_weekly_funnel_report.py \
    --input /path/events.csv --output маркетинг/weekly_funnel_report.md
"""

import argparse
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

EVENTS = [
    'lead',
    'quiz_start',
    'quiz_complete',
    'week_request',
    'trial_active',
    'payment',
    'renewal',
]


def read_rows(path):
    if path.suffix.lower() == '.json':
        data = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            data = data.get('events', [])
        return data
    with path.open(newline='', encoding='utf-8-sig') as fh:
        return list(csv.DictReader(fh))


def num(value):
    if value in (None, ''):
        return 0.0
    return float(str(value).replace(',', '.'))


def pct(a, b):
    if not b:
        return '—'
    return f'{(a / b * 100):.1f}%'


def rub(value):
    if not value:
        return '—'
    return f'{value:,.0f} ₽'.replace(',', ' ')


def build_report(rows):
    by_source = defaultdict(lambda: {
        'events': defaultdict(int),
        'spend': 0.0,
        'revenue': 0.0,
    })
    totals = {
        'events': defaultdict(int),
        'spend': 0.0,
        'revenue': 0.0,
    }

    for row in rows:
        source = (row.get('source') or row.get('utm_source') or 'unknown').strip() or 'unknown'
        event = (row.get('event') or '').strip()
        if event not in EVENTS:
            continue
        bucket = by_source[source]
        bucket['events'][event] += 1
        bucket['spend'] += num(row.get('spend_rub'))
        bucket['revenue'] += num(row.get('revenue_rub'))
        totals['events'][event] += 1
        totals['spend'] += num(row.get('spend_rub'))
        totals['revenue'] += num(row.get('revenue_rub'))

    lines = [
        '# HEYS · Недельный отчёт воронки',
        '',
        f'Дата сборки: {date.today().isoformat()}',
        '',
        'Источник данных: обезличенный export `funnel_events` / CRM / Metrica. '
        'ПДн и health-values в отчёт не попадают.',
        '',
        '## Сводка по источникам',
        '',
        '| Источник | Лиды | Квиз завершён | Неделя | Активный триал | Оплаты | Продления | lead→week | week→payment | Spend | CPL | CAC | Revenue |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]

    def row_for(name, data):
        ev = data['events']
        leads = ev['lead']
        week = ev['week_request']
        payments = ev['payment']
        spend = data['spend']
        cpl = spend / leads if leads else 0
        cac = spend / payments if payments else 0
        return (
            f'| {name} | {leads} | {ev["quiz_complete"]} | {week} | '
            f'{ev["trial_active"]} | {payments} | {ev["renewal"]} | '
            f'{pct(week, leads)} | {pct(payments, week)} | {rub(spend)} | '
            f'{rub(cpl)} | {rub(cac)} | {rub(data["revenue"])} |'
        )

    for source, data in sorted(by_source.items()):
        lines.append(row_for(source, data))
    lines.append(row_for('Итого', totals))

    lines += [
        '',
        '## Красные триггеры',
        '',
        '| Метрика | Порог | Факт | Статус |',
        '| --- | --- | --- | --- |',
        f'| lead→week | ≥40% | {pct(totals["events"]["week_request"], totals["events"]["lead"])} | {"✅" if totals["events"]["lead"] and totals["events"]["week_request"] / totals["events"]["lead"] >= 0.4 else "🟡"} |',
        f'| week→payment | ≥30% | {pct(totals["events"]["payment"], totals["events"]["week_request"])} | {"✅" if totals["events"]["week_request"] and totals["events"]["payment"] / totals["events"]["week_request"] >= 0.3 else "🟡"} |',
        '',
        '## Что переносить в KPI-трекер',
        '',
        '- Лиды по источникам.',
        '- CPL/CAC по источникам.',
        '- `lead→week` и `week→payment`.',
        '- Каналы с нулём оплат не масштабировать без причины в `15_Ревизия`.',
    ]
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    rows = read_rows(args.input)
    report = build_report(rows)
    if args.output:
        args.output.write_text(report, encoding='utf-8')
    else:
        print(report, end='')


if __name__ == '__main__':
    main()

