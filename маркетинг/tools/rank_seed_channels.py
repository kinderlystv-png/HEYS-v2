#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rank Telegram seeding channels using criteria from маркетинг/14 and 07.

Input CSV columns:
channel, topic, subscribers, avg_views, er, bot_share, price_rub, fit

`er`, `bot_share` and `fit` may be entered as 0..1 or percentages.

Usage:
  python3 маркетинг/tools/rank_seed_channels.py --input channels.csv
"""

import argparse
import csv
from pathlib import Path


def ratio(value):
    if value in (None, ''):
        return 0.0
    raw = float(str(value).replace('%', '').replace(',', '.'))
    return raw / 100 if raw > 1 else raw


def number(value):
    if value in (None, ''):
        return 0.0
    return float(str(value).replace(' ', '').replace(',', '.'))


def score(row):
    er = ratio(row.get('er'))
    bots = ratio(row.get('bot_share'))
    fit = ratio(row.get('fit') or 1)
    views = number(row.get('avg_views'))
    price = number(row.get('price_rub'))
    cpm = price / views * 1000 if price and views else 0

    points = 0
    reasons = []
    if fit >= 0.8:
        points += 30
    else:
        points += fit * 30
        reasons.append('fit ниже идеального')
    if er >= 0.02:
        points += 25
    elif er >= 0.015:
        points += 18
    else:
        reasons.append('ER ниже 1.5%')
    if bots <= 0.1:
        points += 25
    else:
        points -= min(25, (bots - 0.1) * 100)
        reasons.append('боты выше 10%')
    if cpm and cpm <= 500:
        points += 20
    elif cpm:
        points += max(0, 20 - (cpm - 500) / 50)
        reasons.append('дорогой CPM')
    else:
        reasons.append('нет цены или просмотров')

    decision = 'test'
    if points < 65 or bots > 0.2 or er < 0.01:
        decision = 'reject'
    elif points < 80:
        decision = 'watch'
    return points, cpm, decision, '; '.join(reasons) or 'ок'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    args = parser.parse_args()

    with args.input.open(newline='', encoding='utf-8-sig') as fh:
        rows = list(csv.DictReader(fh))

    ranked = []
    for row in rows:
        points, cpm, decision, reasons = score(row)
        ranked.append((points, cpm, decision, reasons, row))
    ranked.sort(reverse=True, key=lambda item: item[0])

    print('| Канал | Тема | Score | Решение | ER | Боты | CPM | Комментарий |')
    print('| --- | --- | ---: | --- | ---: | ---: | ---: | --- |')
    for points, cpm, decision, reasons, row in ranked:
        print(
            f'| {row.get("channel", "")} | {row.get("topic", "")} | '
            f'{points:.0f} | {decision} | {ratio(row.get("er")) * 100:.1f}% | '
            f'{ratio(row.get("bot_share")) * 100:.1f}% | '
            f'{cpm:.0f} ₽ | {reasons} |'
        )


if __name__ == '__main__':
    main()

