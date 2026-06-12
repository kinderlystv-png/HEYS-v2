#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Генератор HTML-дашборда маркетинга HEYS (план 22, п.5.1).

Читает: 00_Сводная_панель.xlsx (Сводка, Конкуренты, Telegram, KPI-трекер),
22_План (единый источник статусов задач), 25_Roadmap (гейты), 29_Аудит
(сводные таблицы конкурентов), 30_Имплемент_мап (эталон; статусы пунктов
с задачей «22 N.N» подтягиваются из 22), 24_посты (контент-батч).
Пишет: 00_Дашборд.html (самодостаточный, офлайн; вкладки:
Обзор / Конкуренты / Имплемент-мап / Telegram).

При сломанной структуре источников падает с ненулевым кодом — pre-commit
хук тогда блокирует коммит рассинхронизированного дашборда.

Запуск:  python3 маркетинг/tools/build_dashboard.py
"""
import datetime
import html
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent  # маркетинг/


def esc(v):
    return html.escape(str(v)) if v is not None else ''


def parse_md_table(lines, start_idx):
    """Читает markdown-таблицу начиная с строки заголовка."""
    head = [c.strip().replace('**', '') for c in
            lines[start_idx].strip().strip('|').split('|')]
    rows = []
    for line in lines[start_idx + 1:]:
        if not line.strip().startswith('|'):
            break
        cells = [c.strip().replace('**', '') for c in
                 line.strip().strip('|').split('|')]
        if set(cells[0]) <= {'-', ' ', ':'}:
            continue
        rows.append(cells)
    return head, rows


wb = openpyxl.load_workbook(ROOT / '00_Сводная_панель.xlsx', data_only=True)

# ---------- Сводка ----------
sv = wb['Сводка']
tariffs = [[sv.cell(row=r, column=c).value for c in range(2, 7)]
           for r in range(12, 16) if sv.cell(row=r, column=2).value]
tariff_note = sv['B17'].value or ''
eco = {'base': sv['B21'].value, 'real': sv['D21'].value, 'goal': sv['F21'].value,
       'note': sv['B22'].value or ''}
priorities = [sv.cell(row=r, column=2).value for r in range(25, 29)
              if sv.cell(row=r, column=2).value]
sut, pos = sv['B5'].value or '', sv['B8'].value or ''
channels, rule = sv['B31'].value or '', sv['B40'].value or ''

kpi = []
kws = wb['KPI-трекер']
for r in range(4, kws.max_row + 1):
    if kws.cell(row=r, column=1).value:
        kpi.append({'name': kws.cell(row=r, column=1).value,
                    'goal': kws.cell(row=r, column=2).value,
                    'dir': kws.cell(row=r, column=3).value,
                    'fact': kws.cell(row=r, column=4).value})

# ---------- Конкуренты ----------
cw = wb['Конкуренты']
calzen_short = cw['A5'].value or ''
comp_head = [cw.cell(row=9, column=c).value for c in range(1, 7)]
comp_rows = [[cw.cell(row=r, column=c).value for c in range(1, 7)]
             for r in range(10, 20) if cw.cell(row=r, column=1).value]
land_rows = [[cw.cell(row=r, column=1).value, cw.cell(row=r, column=2).value,
              cw.cell(row=r, column=4).value, cw.cell(row=r, column=5).value]
             for r in range(23, 31) if cw.cell(row=r, column=1).value]
top5 = [cw.cell(row=r, column=1).value for r in range(33, 42)
        if cw.cell(row=r, column=1).value]
no_copy = cw['A44'].value or ''
# Глубокий аудит 2026-06-10 (строки 46+)
audit_head = cw['A47'].value or ''
human_rows = [[cw.cell(row=r, column=c).value for c in range(1, 6)]
              for r in range(51, 57) if cw.cell(row=r, column=1).value]
price_ladder = cw['A59'].value or ''
landing_patterns = [cw.cell(row=r, column=1).value for r in range(62, 67)
                    if cw.cell(row=r, column=1).value]

# ---------- контент-батч из 24 ----------
posts, post_calendar, post_prereq = [], '', ''
posts_path = ROOT / '24_Telegram_посты_батч1.md'
if posts_path.exists():
    p_text = posts_path.read_text(encoding='utf-8')
    posts = re.findall(r'^## (П\d+) — ([^\n*]+)', p_text, re.M)
    p_lines = p_text.splitlines()
    cal_idx = next((i for i, ln in enumerate(p_lines)
                    if ln.startswith('|') and 'Нед' in ln), None)
    if cal_idx is not None:
        _, cal_rows = parse_md_table(p_lines, cal_idx)
        post_calendar = ('<tr><th>Нед</th><th>Пн</th><th>Ср</th><th>Пт</th>'
                         '<th>Вс</th></tr>' +
                         ''.join('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in r)
                                 + '</tr>' for r in cal_rows))
    m = re.search(r'Prerequisite публикации П0:(.*?)(?=\n\n|\Z)', p_text, re.S)
    if m:
        post_prereq = ' '.join(m.group(1).replace('>', ' ').split())

# ---------- Telegram ----------
tg = wb['Telegram']
tg_role = tg['B5'].value or ''
tg_rubrics = [[tg.cell(row=r, column=2).value, tg.cell(row=r, column=3).value,
               tg.cell(row=r, column=5).value]
              for r in range(9, 15) if tg.cell(row=r, column=2).value]
tg_blocks = [('Ритм ведения', tg['B17'].value), ('Воронка', tg['B25'].value),
             ('Метрики', tg['B28'].value), ('Легал (ERID)', tg['B31'].value),
             ('Чего не делать', tg['B34'].value)]
tg_promo = [tg['B20'].value, tg['B21'].value, tg['B22'].value]
tg_start14_rows = []
tg_playbook_path = ROOT / '14_Telegram_плейбук.md'
if tg_playbook_path.exists():
    tg_playbook_lines = tg_playbook_path.read_text(encoding='utf-8').splitlines()
    start14_idx = next((i for i, ln in enumerate(tg_playbook_lines)
                        if ln.startswith('|') and 'День' in ln and 'Действие' in ln), None)
    if start14_idx is not None:
        _, tg_start14_rows = parse_md_table(tg_playbook_lines, start14_idx)

# ---------- сводные таблицы из 29 (приложения / лендинги) ----------
audit_apps, audit_landings = ([], []), ([], [])
adopt_landing, adopt_product = ([], []), ([], [])
no_copy_decided = ''
audit_path = ROOT / '29_Аудит_конкурентов_глубокий.md'
if audit_path.exists():
    a_text = audit_path.read_text(encoding='utf-8')
    a_lines = a_text.splitlines()
    in_landing_sec = in_product_sec = False
    for i, ln in enumerate(a_lines):
        if ln.startswith('### В ЛЕНДИНГ'):
            in_landing_sec, in_product_sec = True, False
        elif ln.startswith('### В ПРОДУКТ'):
            in_landing_sec, in_product_sec = False, True
        elif ln.startswith('#'):
            in_landing_sec = in_product_sec = False
        if ln.startswith('|') and 'Ввод еды' in ln:
            audit_apps = parse_md_table(a_lines, i)
        elif ln.startswith('|') and 'Hero-фрейм' in ln:
            audit_landings = parse_md_table(a_lines, i)
        elif ln.startswith('|') and 'У кого подсмотрено' in ln:
            if in_landing_sec:
                adopt_landing = parse_md_table(a_lines, i)
            elif in_product_sec:
                adopt_product = parse_md_table(a_lines, i)
    m = re.search(r'### НЕ КОПИРУЕМ[^\n]*\n+(.*?)\n\n---', a_text, re.S)
    if m:
        no_copy_decided = ' '.join(m.group(1).split())

# ---------- имплемент-мап из 30 ----------
imap_landing, imap_product = ([], []), ([], [])
imap_rule = imap_no_copy = ''
imap_path = ROOT / '30_Имплемент_мап.md'
if imap_path.exists():
    i_text = imap_path.read_text(encoding='utf-8')
    i_lines = i_text.splitlines()
    cur = None
    for i, ln in enumerate(i_lines):
        if ln.startswith('## В ЛЕНДИНГ') or ln.startswith('## Что заимствуем'):
            cur = 'L'
        elif ln.startswith('## В ПРИЛОЖЕНИЕ') or ln.startswith('## После релиза'):
            cur = 'P'
        elif ln.startswith('## '):
            cur = None
        if ln.startswith('|') and 'Почему' in ln:
            if cur == 'L':
                imap_landing = parse_md_table(i_lines, i)
            elif cur == 'P':
                imap_product = parse_md_table(i_lines, i)
    m = re.search(r'\*\*Правило актуализации:\*\*(.*?)\n\n', i_text, re.S)
    if m:
        imap_rule = ' '.join(m.group(1).replace('>', ' ').split())
    m = re.search(r'## Не копируем[^\n]*\n\n(.*?)\n\n---', i_text, re.S)
    if m:
        imap_no_copy = ' '.join(m.group(1).split())


# ---------- статусы этапов из 22 ----------
plan_text = (ROOT / '22_План_реализации_маркетинга.md').read_text(encoding='utf-8')
stages = []
task_status = {}  # '3.7' -> '✅'/'🟡'/'⬜' — единый источник статусов задач
for m in re.finditer(r'^## (Этап \d[^\n]*)\n(.*?)(?=^## |\Z)', plan_text, re.M | re.S):
    rows = re.findall(r'^\|\s*(\d+\.\d+)\s*\|\s*([^|]+?)\s*\|.*\|\s*(✅|⬜|🟡)\s*\|',
                      m.group(2), re.M)
    if rows:
        t = m.group(1)
        for tid, name, st in rows:
            task_status[tid] = st
        stages.append({'title': t.split('—')[0].strip(),
                       'desc': t.split('—')[1].strip() if '—' in t else '',
                       'done': sum(1 for r in rows if r[2] == '✅')
                       + 0.5 * sum(1 for r in rows if r[2] == '🟡'),
                       'total': len(rows),
                       'tasks': [(tid, re.sub(r'\*\*', '', name), st)
                                 for tid, name, st in rows]})

# ---------- гейты из 25 ----------
gates = []
lines = (ROOT / '25_Roadmap_Ф0_Ф1.md').read_text(encoding='utf-8').splitlines()
start = next((i for i, ln in enumerate(lines) if 'Гейт / метрика' in ln), None)
if start is not None:
    for line in lines[start + 1:]:
        if not line.strip().startswith('|'):
            break
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 7 and not set(cells[0]) <= {'-', ' '}:
            gates.append({'name': re.sub(r'\*\*', '', cells[0]), 'goal': cells[1],
                          'trigger': cells[2], 'action': cells[3],
                          'status': cells[6]})


def chip(s):
    if '✅' in s:
        return '<span class="chip ok">готово</span>'
    if '🟡' in s:
        return '<span class="chip mid">в работе</span>'
    return '<span class="chip wait">ожидает</span>'


now = datetime.datetime.now()
today = now.strftime('%Y-%m-%d %H:%M')
gen_epoch_ms = int(now.timestamp() * 1000)
total_done = sum(s['done'] for s in stages)
total_all = sum(s['total'] for s in stages)
plan_pct = round(total_done / total_all * 100) if total_all else 0

# ---------- фрагменты: Обзор ----------
tariff_cards = ''
for t in tariffs:
    feat = ' featured' if t[0] == 'Pro' else (' archive' if 'Lite' in str(t[0]) else '')
    tariff_cards += (f'<div class="tariff{feat}"><div class="t-name">{esc(t[0])}</div>'
                     f'<div class="t-price">{esc(t[1])}</div>'
                     f'<div class="t-row"><span>Куратор</span><b>{esc(t[2])}</b></div>'
                     f'<div class="t-row"><span>AI</span><b>{esc(t[3])}</b></div>'
                     f'<div class="t-row"><span>Удержание</span><b>{esc(t[4])}</b></div></div>')

gate_rows = ''.join(
    f'<tr><td>{esc(g["name"])}</td><td class="num">{esc(g["goal"])}</td>'
    f'<td class="dim">{esc(g["trigger"])}</td><td class="dim">{esc(g["action"])}</td>'
    f'<td>{chip(g["status"])}</td></tr>' for g in gates)

stage_rows = ''
for s in stages:
    pct = round(s['done'] / s['total'] * 100)
    task_list = ''.join(
        f'<li><span class="chip {"ok" if st == "✅" else ("mid" if st == "🟡" else "wait")}">'
        f'{esc(tid)}</span> {esc(name)}</li>'
        for tid, name, st in s['tasks'])
    stage_rows += (
        f'<details class="stage-d"><summary class="stage">'
        f'<div class="s-head"><b>{esc(s["title"])}</b>'
        f'<span class="dim">{esc(s["desc"])}</span></div>'
        f'<div class="s-bar"><div class="bar"><div class="bar-fill" '
        f'style="width:{pct}%"></div></div>'
        f'<span class="bar-num">{pct}%</span>'
        f'<span class="dim s-count">{s["done"]:g}/{s["total"]}</span></div></summary>'
        f'<ul class="task-list">{task_list}</ul></details>')

kpi_rows = ''
for k in kpi:
    goal = k['goal']
    if isinstance(goal, float) and goal <= 1:
        goal = f'{goal:.0%}'
    fact = k['fact'] if k['fact'] not in (None, '') else '—'
    kpi_rows += (f'<div class="kpi{" k-wait" if fact == "—" else ""}'
                 f'"><div class="k-name">{esc(k["name"])}</div>'
                 f'<div class="k-val">{esc(fact)}</div>'
                 f'<div class="k-goal">цель {esc(k["dir"] or "")} {esc(goal)}</div></div>')

prio_rows = ''.join(
    f'<div class="prio"><div class="p-num">{i}</div>'
    f'<div>{esc(re.sub(r"^[0-9]+[.][ ]*", "", str(p)))}</div></div>'
    for i, p in enumerate(priorities, 1))

# ---------- фрагменты: Конкуренты ----------
comp_table = '<tr>' + ''.join(f'<th>{esc(h)}</th>' for h in comp_head) + '</tr>'
for r in comp_rows:
    comp_table += ('<tr><td class="dim">' + esc(r[0]) + '</td><td class="hl">' +
                   esc(r[1]) + '</td>' +
                   ''.join(f'<td>{esc(x)}</td>' for x in r[2:]) + '</tr>')

land_table = ('<tr><th>Блок</th><th>CalZen</th><th>Наш</th><th>Что перенять</th></tr>' +
              ''.join('<tr><td class="dim">' + esc(r[0]) + '</td><td>' + esc(r[1]) +
                      '</td><td>' + esc(r[2]) + '</td><td class="hl">' + esc(r[3]) +
                      '</td></tr>' for r in land_rows))

top5_rows = ''.join(f'<div class="prio top5"><div class="p-num acc2">{i}</div>'
                    f'<div>{esc(re.sub(r"^[0-9]+[.][ ]*", "", str(p)))}</div></div>'
                    for i, p in enumerate(top5, 1))

# ---------- фрагменты: Telegram ----------
human_table = ''.join(
    '<tr>' + ''.join(
        ('<td class="hl">' if i == 0 and 'HEYS' in str(r[0]) else '<td>') + esc(x) + '</td>'
        for i, x in enumerate(r)) + '</tr>'
    for r in human_rows)
landing_pat_rows = ''.join(
    f'<div class="prio top5"><div class="p-num acc2">{i}</div>'
    f'<div>{esc(re.sub(r"^[0-9]+[.][ ]*", "", str(p)))}</div></div>'
    for i, p in enumerate(landing_patterns, 1))


def render_audit_table(head_rows):
    head, rows = head_rows
    if not rows:
        return '<p class="dim">таблица не найдена в 29</p>'
    out = '<tr>' + ''.join(f'<th>{esc(h)}</th>' for h in head) + '</tr>'
    for r in rows:
        hl = ' class="hl-row"' if 'HEYS' in r[0] else ''
        out += f'<tr{hl}>' + ''.join(f'<td>{esc(c)}</td>' for c in r) + '</tr>'
    return out


audit_apps_table = render_audit_table(audit_apps)
audit_landings_table = render_audit_table(audit_landings)


def render_adopt(head_rows):
    _, rows = head_rows
    out = ''
    for r in rows:
        if len(r) < 4:
            continue
        st = r[3]
        cls = 'ok' if '✅' in st else ('mid' if '🟡' in st else 'wait')
        out += (f'<div class="adopt"><span class="chip {cls}">{esc(st)}</span>'
                f'<div><b>{esc(r[0])}</b>'
                f'<div class="label">{esc(r[1])} → {esc(r[2])}</div></div></div>')
    return out or '<p class="dim">нет данных (29 §10)</p>'


adopt_landing_html = render_adopt(adopt_landing)
adopt_product_html = render_adopt(adopt_product)


def render_imap(head_rows):
    _, rows = head_rows
    out = ('<tr><th>№</th><th>Что</th><th>Почему (29)</th><th>Задача</th>'
           '<th>Очередь</th><th>Статус</th></tr>')
    done = 0
    for r in rows:
        if len(r) < 6:
            continue
        st = r[5]
        # live-статус из 22, если в колонке «Задача» есть ссылка `22` N.N
        tm = re.search(r'22[`»\s]*\s*(\d+\.\d+)', r[3])
        if tm and tm.group(1) in task_status:
            st = task_status[tm.group(1)]
        cls = 'ok' if '✅' in st else ('mid' if '🟡' in st else 'wait')
        if '✅' in st:
            done += 1
        label = 'готово' if '✅' in st else ('в работе' if '🟡' in st else 'ожидает')
        out += (f'<tr><td class="num">{esc(r[0])}</td><td><b>{esc(r[1])}</b></td>'
                f'<td class="dim">{esc(r[2])}</td><td>{esc(r[3])}</td>'
                f'<td class="dim">{esc(r[4])}</td>'
                f'<td><span class="chip {cls}">{label}</span></td></tr>')
    return out, done, len(rows)


imap_landing_table, imap_l_done, imap_l_total = render_imap(imap_landing)
imap_product_table, imap_p_done, imap_p_total = render_imap(imap_product)

tg_rubric_rows = ('<tr><th>Рубрика</th><th>Цель</th><th>Частота</th></tr>' +
                  ''.join(f'<tr><td>{esc(r[0])}</td><td class="dim">{esc(r[1])}</td>'
                          f'<td class="num">{esc(r[2])}</td></tr>' for r in tg_rubrics))
tg_block_cards = ''.join(f'<div class="card"><h2>{esc(t)}</h2><p class="sm">{esc(b)}</p></div>'
                         for t, b in tg_blocks if b)
tg_promo_list = ''.join(f'<li>{esc(p)}</li>' for p in tg_promo if p)
tg_start14_table = ('<tr><th>День</th><th>Действие</th></tr>' +
                    ''.join(f'<tr><td class="num">{esc(r[0])}</td><td>{esc(r[1])}</td></tr>'
                            for r in tg_start14_rows))

html_out = f'''<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HEYS · Панель управления маркетингом</title>
<style>
:root {{ --bg:#0b1020; --card:#121931; --card2:#0f1530; --line:#1f2a4d;
  --txt:#e8ecf8; --dim:#8b96b8; --acc:#4f8cff; --ok:#2dd4a7; --warn:#f5b14c;
  --red:#f0647c; }}
* {{ box-sizing:border-box; margin:0; }}
body {{ background:radial-gradient(1100px 500px at 80% -10%,#16224a 0%,var(--bg) 55%);
  color:var(--txt); font:13.5px/1.45 -apple-system,'SF Pro Text',Segoe UI,Roboto,sans-serif;
  padding:18px clamp(12px,3vw,36px) 40px; }}
h1 {{ font-size:clamp(17px,2.2vw,23px); letter-spacing:-.4px; }}
h2 {{ font-size:11px; text-transform:uppercase; letter-spacing:.12em;
  color:var(--dim); margin:0 0 8px; }}
.header {{ display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center;
  justify-content:space-between; margin-bottom:8px; }}
.badge {{ background:linear-gradient(135deg,#4f8cff33,#2dd4a733);
  border:1px solid #4f8cff55; padding:4px 12px; border-radius:999px; font-size:12px; }}
.sub {{ color:var(--dim); font-size:12.5px; max-width:1000px; margin-bottom:12px; }}
.tabs {{ display:flex; gap:6px; margin:4px 0 16px; border-bottom:1px solid var(--line); }}
.tab {{ background:none; border:none; color:var(--dim); font:600 13px inherit;
  padding:8px 14px; cursor:pointer; border-bottom:2px solid transparent; }}
.tab.active {{ color:var(--txt); border-bottom-color:var(--acc); }}
.pane {{ display:none; }} .pane.active {{ display:block; }}
.grid {{ display:grid; gap:12px; }}
.cards3 {{ grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }}
.card {{ background:linear-gradient(180deg,var(--card),var(--card2));
  border:1px solid var(--line); border-radius:12px; padding:12px 14px; }}
.big {{ font-size:clamp(24px,3vw,34px); font-weight:700; letter-spacing:-.5px; }}
.big.ok {{ color:var(--ok); }} .big.acc {{ color:var(--acc); }}
.label {{ color:var(--dim); font-size:11.5px; }}
.sm {{ font-size:12.5px; }}
section {{ margin-top:18px; }}
table {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
th {{ text-align:left; color:var(--dim); font-weight:500; font-size:10.5px;
  text-transform:uppercase; letter-spacing:.07em; padding:6px 8px;
  border-bottom:1px solid var(--line); }}
td {{ padding:6px 8px; border-bottom:1px solid #16203f; vertical-align:top; }}
td.num {{ white-space:nowrap; font-weight:600; }}
td.hl {{ color:var(--ok); font-weight:600; }}
tr.hl-row td {{ color:var(--ok); font-weight:600; background:#2dd4a70d; }}
.scrollx {{ overflow-x:auto; }} .scrollx table {{ min-width:760px; }}
.dim {{ color:var(--dim); }}
.chip {{ padding:2px 9px; border-radius:999px; font-size:11px; white-space:nowrap; }}
.chip.ok {{ background:#2dd4a722; color:var(--ok); border:1px solid #2dd4a744; }}
.chip.mid {{ background:#f5b14c22; color:var(--warn); border:1px solid #f5b14c44; }}
.chip.wait {{ background:#8b96b81e; color:var(--dim); border:1px solid #8b96b833; }}
.tariffs {{ grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); }}
.tariff {{ background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:10px 12px; }}
.tariff.featured {{ border-color:var(--acc); box-shadow:0 0 0 1px var(--acc); }}
.tariff.archive {{ opacity:.5; }}
.t-name {{ font-weight:700; font-size:13px; }}
.t-price {{ font-size:19px; font-weight:700; margin-bottom:6px; color:var(--acc); }}
.tariff.featured .t-price {{ color:var(--ok); }}
.t-row {{ display:flex; justify-content:space-between; gap:8px; font-size:11.5px;
  padding:2.5px 0; border-top:1px dashed #1f2a4d; }}
.t-row span {{ color:var(--dim); }} .t-row b {{ font-weight:500; text-align:right; }}
.stage {{ display:grid; grid-template-columns:minmax(150px,1fr) 1.6fr; gap:10px;
  align-items:center; padding:6px 0; border-bottom:1px solid #16203f; font-size:12.5px; }}
.s-head {{ display:flex; flex-direction:column; }}
.s-bar {{ display:flex; align-items:center; gap:8px; }}
.bar {{ flex:1; height:6px; background:#1a2447; border-radius:99px; overflow:hidden; }}
.bar-fill {{ height:100%; background:linear-gradient(90deg,var(--acc),var(--ok)); }}
.bar-num {{ font-weight:700; font-size:12px; min-width:34px; }}
.s-count {{ font-size:11px; min-width:36px; text-align:right; }}
details.stage-d > summary {{ cursor:pointer; list-style:none; }}
details.stage-d > summary::-webkit-details-marker {{ display:none; }}
details.stage-d[open] > summary .s-head b {{ color:var(--acc); }}
.task-list {{ margin:4px 0 10px; padding-left:6px; list-style:none; }}
.task-list li {{ font-size:12px; padding:3px 0; border-bottom:1px dashed #16203f; }}
.task-list .chip {{ margin-right:6px; }}
.kpis {{ grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); }}
.kpi {{ background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:9px 11px; }}
.kpi.k-wait .k-val {{ color:var(--dim); }}
.k-name {{ font-size:11px; color:var(--dim); min-height:26px; }}
.k-val {{ font-size:19px; font-weight:700; }}
.k-goal {{ font-size:11px; color:var(--dim); }}
.prios {{ display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); }}
.prio {{ display:flex; gap:10px; background:var(--card); border:1px solid var(--line);
  border-left:3px solid var(--red); border-radius:10px; padding:9px 12px; font-size:12.5px; }}
.prio.top5 {{ border-left-color:var(--acc); }}
.adopt {{ display:flex; gap:10px; align-items:flex-start; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:9px 12px;
  margin-bottom:8px; font-size:12.5px; }}
.adopt .chip {{ flex-shrink:0; margin-top:2px; }}
#stale-warn {{ display:none; background:#f5b14c22; border:1px solid #f5b14c66;
  color:var(--warn); border-radius:10px; padding:8px 14px; margin-bottom:14px;
  font-size:12.5px; }}
.p-num {{ font-size:16px; font-weight:800; color:var(--red); line-height:1.3; }}
.p-num.acc2 {{ color:var(--acc); }}
.cols2 {{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }}
ul {{ padding-left:18px; }} li {{ margin-bottom:4px; font-size:12.5px; }}
footer {{ margin-top:26px; color:var(--dim); font-size:11px;
  border-top:1px solid var(--line); padding-top:10px; }}
</style></head><body>

<div class="header">
  <h1>HEYS · Панель управления маркетингом</h1>
  <div class="tabs">
    <button class="tab active" data-pane="overview">Обзор</button>
    <button class="tab" data-pane="comp">Конкуренты</button>
    <button class="tab" data-pane="imap">Имплемент-мап</button>
    <button class="tab" data-pane="tg">Telegram</button>
  </div>
  <span class="badge">Фаза 0 · Pro-first · план: {plan_pct}% · собрано {today}</span>
</div>
<div id="stale-warn">⚠ Этот снимок дашборда собран больше суток назад — данные могли устареть.
Обновить: двойной клик по <b>Обновить_дашборд.command</b> (или
<code>python3 маркетинг/tools/build_dashboard.py</code>).</div>

<div class="pane active" id="overview">
<p class="sub">{esc(sut)} {esc(pos)}</p>
<div class="grid cards3">
  <div class="card"><div class="label">LTV:CAC реальный (триал = время куратора)</div>
    <div class="big ok">{esc(eco['real'])}</div><div class="label">цель {esc(eco['goal'])}</div></div>
  <div class="card"><div class="label">LTV:CAC модельный</div>
    <div class="big acc">{esc(eco['base'])}</div><div class="label">микс Self 20 / Pro 65 / Pro+ 15</div></div>
  <div class="card"><div class="label">Готовность плана (22)</div>
    <div class="big">{plan_pct}%</div><div class="label">{total_done:g} из {total_all} задач</div></div>
</div>
<p class="label" style="margin-top:6px">{esc(eco['note'])}</p>

<section><h2>Приоритеты сейчас</h2><div class="prios">{prio_rows}</div></section>

<section><h2>Гейты Ф0 → Ф1 (roadmap 25)</h2>
<div class="card" style="padding:4px 8px"><table>
<tr><th>Гейт</th><th>Цель</th><th>🔴 Триггер</th><th>Действие при провале</th><th>Статус</th></tr>
{gate_rows}</table></div></section>

<div class="cols2" style="margin-top:18px">
<div><h2>Этапы плана 22</h2><div class="card">{stage_rows}</div></div>
<div><h2>Тарифная сетка</h2><div class="grid tariffs">{tariff_cards}</div>
<p class="label" style="margin-top:6px">{esc(tariff_note)}</p></div>
</div>

<section><h2>KPI-трекер (факт — с первого трафика)</h2>
<div class="grid kpis">{kpi_rows}</div></section>

<section class="cols2">
<div class="card"><h2>Каналы</h2><p class="sm">{esc(channels)}</p></div>
<div class="card"><h2>Правило роста</h2><p class="sm">{esc(rule)}</p></div>
</section>
</div>

<div class="pane" id="comp">
<p class="sub"><b>Главный вывод аудита 2026-06-10:</b> {esc(audit_head)}</p>
<p class="label">Что переносим в лендинг/продукт и статусы — вкладка <b>«Имплемент-мап»</b> (источник: 30).</p>
<section><h2>Карта «живой человек» (кто реально даёт)</h2>
<div class="card" style="padding:4px 8px"><table>
<tr><th>Игрок</th><th>Человек</th><th>Частота</th><th>Цена/мес</th><th>РФ-оплата</th></tr>
{human_table}
</table></div>
<p class="label" style="margin-top:6px">{esc(price_ladder)}</p></section>
<section><h2>Сводная: ПРИЛОЖЕНИЯ — все игроки (29 §4)</h2>
<div class="card scrollx" style="padding:4px 8px"><table>{audit_apps_table}</table></div></section>
<section><h2>Сводная: ЛЕНДИНГИ — все игроки (29 §5)</h2>
<div class="card scrollx" style="padding:4px 8px"><table>{audit_landings_table}</table></div></section>
<section><h2>Лендинги лидеров — 5 паттернов</h2>
{landing_pat_rows}
</section>
<p class="sub" style="margin-top:14px"><b>CalZen — главный референс:</b> {esc(calzen_short)}</p>
<section><h2>Сводная таблица сегментов</h2>
<div class="card" style="padding:4px 8px"><table>{comp_table}</table></div></section>
<section><h2>Лендинги: CalZen vs наш — что перенять</h2>
<div class="card" style="padding:4px 8px"><table>{land_table}</table></div></section>
<section><h2>Что оставить из конкурентки</h2>{top5_rows}</section>
<section class="card"><h2>Чего не копировать</h2><p class="sm">{esc(no_copy)}</p></section>
<p class="label" style="margin-top:10px">Детали: 12 (CalZen/лендинги) · 06 (позиционирование) · 16 (паттерны) · навигатор — 26.</p>
</div>

<div class="pane" id="imap">
<p class="sub"><b>Эталон конкурентной комбинации</b> (источник: 30_Имплемент_мап). {esc(imap_rule)}</p>
<section><h2>Что заимствуем — {imap_l_done}/{imap_l_total} готово</h2>
<div class="card scrollx" style="padding:4px 8px"><table>{imap_landing_table}</table></div></section>
<section><h2>После релиза — {imap_p_done}/{imap_p_total} готово</h2>
<div class="card scrollx" style="padding:4px 8px"><table>{imap_product_table}</table></div></section>
<section class="card"><h2>Не копируем (анти-эталон)</h2><p class="sm">{esc(imap_no_copy)}</p></section>
</div>

<div class="pane" id="tg">
<p class="sub">{esc(tg_role)}</p>
<section><h2>Контент-батч №1 — {len(posts)} постов готово (24)</h2>
<div class="cols2">
<div class="card" style="padding:4px 8px"><table>{post_calendar}</table>
<p class="label" style="padding:6px">⚠ {esc(post_prereq)}</p></div>
<div class="card"><ul class="task-list">
{''.join(f'<li><span class="chip wait">{esc(pid)}</span> {esc(t.strip())}</li>' for pid, t in posts)}
</ul></div></div></section>
	<div class="cols2">
	<div><h2>Рубрики (банк тем — 14, батч №1 — 24)</h2>
	<div class="card" style="padding:4px 8px"><table>{tg_rubric_rows}</table></div>
	<section><h2>Продвижение</h2><div class="card"><ul>{tg_promo_list}</ul></div></section></div>
	<div class="grid" style="align-content:start">{tg_block_cards}</div>
	</div>
	<section><h2>Первые 14 дней канала (14)</h2>
	<div class="card scrollx" style="padding:4px 8px"><table>{tg_start14_table}</table></div></section>
	</div>

<footer>Сгенерировано {today} · данные: 00_Сводная_панель.xlsx · 22_План · 25_Roadmap · 29_Аудит ·
обновление: <b>Обновить_дашборд.command</b> (двойной клик) · авто на каждом коммите источников ·
<code>python3 маркетинг/tools/build_dashboard.py</code></footer>

<script>
(function () {{
  var age = Date.now() - {gen_epoch_ms};
  if (age > 24 * 3600 * 1000) document.getElementById('stale-warn').style.display = 'block';
}})();
</script>
<script>
document.querySelectorAll('.tab').forEach(function (t) {{
  t.addEventListener('click', function () {{
    document.querySelectorAll('.tab').forEach(function (x) {{ x.classList.remove('active'); }});
    document.querySelectorAll('.pane').forEach(function (x) {{ x.classList.remove('active'); }});
    t.classList.add('active');
    document.getElementById(t.dataset.pane).classList.add('active');
  }});
}});
</script>
</body></html>'''

# ---------- sanity-checks: громко падаем при сломанной структуре ----------
problems = []
for cond, msg in [
    (len(tariffs) >= 3, 'Сводка: тарифная сетка < 3 строк (B12:F15)'),
    (eco['real'] and eco['base'], 'Сводка: пустая экономика (B21/D21)'),
    (len(priorities) >= 3, 'Сводка: приоритеты < 3 (B25:B28)'),
    (len(stages) >= 5, '22_План: найдено < 5 этапов'),
    (sum(s['total'] for s in stages) >= 20, '22_План: подозрительно мало задач'),
    (len(gates) >= 7, '25_Roadmap: гейтов < 7'),
    (len(kpi) >= 10, 'KPI-трекер: метрик < 10'),
    (len(audit_apps[1]) >= 10, '29 §4: таблица приложений < 10 строк'),
    (len(audit_landings[1]) >= 10, '29 §5: таблица лендингов < 10 строк'),
    (len(human_rows) >= 4, 'xlsx Конкуренты: карта «живой человек» < 4 строк (A51+)'),
    (len(imap_landing[1]) >= 5, '30: секция заимствований < 5 пунктов'),
    (len(imap_product[1]) >= 2, '30: секция «После релиза» < 2 пунктов'),
    (len(posts) >= 5, '24: найдено < 5 постов (заголовки «## ПN — …»)'),
    (len(tg_start14_rows) >= 5, '14: план первых 14 дней Telegram < 5 строк'),
]:
    if not cond:
        problems.append(msg)

# ВСЕ ссылки «22 N.N» из имплемент-мапа должны существовать в 22
for sec_name, (_, rows) in (('Что заимствуем', imap_landing), ('После релиза', imap_product)):
    for r in rows:
        if len(r) < 6:
            continue
        for tid in re.findall(r'22[`»\s]*\s*(\d+\.\d+)', r[3]):
            if tid not in task_status:
                problems.append(
                    f'30 ({sec_name}, {r[0]}): ссылка на задачу 22 {tid} — '
                    f'такой задачи нет в 22 (потеряна/переименована?)')
if problems:
    import sys
    print('❌ Структура источников сломана — дашборд НЕ пересобран:')
    for p in problems:
        print('   •', p)
    print('Почини источник (см. docstring) и перезапусти.')
    sys.exit(1)

out = ROOT / '00_Дашборд.html'
out.write_text(html_out, encoding='utf-8')
print(f'OK → {out} ({len(html_out)} bytes; этапов {len(stages)}, гейтов {len(gates)}, '
      f'KPI {len(kpi)}, конкуренты {len(comp_rows)} строк, рубрик {len(tg_rubrics)})')
