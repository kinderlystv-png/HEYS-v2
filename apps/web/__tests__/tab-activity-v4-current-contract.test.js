import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(WEB_DIR, name), 'utf8');

const CSS = read('styles/modules/731-ui-v4-activity.css');
const ACTIVITY = read('heys_day_activity_v1.js');
const STRENGTH = read('strength/heys_strength_superset_ui_v1.js');

describe('Активность v4: актуальные состояния шагов', () => {
  it('дорожка и data-состояния используют роли актуального набора', () => {
    expect(CSS).toContain('margin-top: 14px;');
    expect(CSS).toContain('background: var(--v4-track, rgba(0, 0, 0, 0.12));');
    expect(CSS).toContain('color: var(--v4-ink-data, rgba(0, 0, 0, 0.56));');
    expect(CSS).toContain('background: var(--v4-plan, rgba(0, 0, 0, 0.22));');
  });

  it('ползунок виден, но вся 44-px полоса остаётся зоной ввода', () => {
    expect(CSS).toContain('height: 44px;');
    expect(CSS).toContain('width: 20px;');
    expect(CSS).toContain('0 1px 3px rgba(80, 50, 20, 0.28)');
    expect(ACTIVITY).toContain("className: 'steps-slider',");
    expect(ACTIVITY).toContain('onMouseDown: handleStepsDrag');
    expect(ACTIVITY).toContain('activity-v4-steps__slider--muted');
  });
});

describe('Активность v4: идущая силовая', () => {
  it('идущая сессия получает отдельное состояние и точный контекст продолжения', () => {
    expect(STRENGTH).toContain("' sb-card--running'");
    expect(STRENGTH).toContain("'упражнение ' + (currentIdx + 1) + ' из '");
    expect(STRENGTH).toContain("className: 'sb-card-current'");
    expect(STRENGTH).toContain("' · подход ' + (currentApproachIdx + 1) + ' из '");
    expect(ACTIVITY).toContain("sub: 'силовая идёт · '");
    expect(ACTIVITY).toContain('chevron: trainingsRow.running');
  });

  it('акцент не скрывает основное действие и отделяет подпись подхода', () => {
    expect(CSS).toContain('.activity-v4 .sb-card--running');
    expect(CSS).toContain('box-shadow: inset 0 0 0 2px var(--v4-act');
    expect(CSS).toContain('.activity-v4 .sb-card-current');
    expect(CSS).toContain('min-height: 48px;');
    expect(STRENGTH).toContain('Пока тренировка идёт, объём и калории');
  });
});

describe('Активность v4: нагрузка раскрывается вторым слоем', () => {
  it('первый слой сохраняет два равнозначных выхода без блокировки', () => {
    expect(ACTIVITY).toContain('Взять день жимов');
    expect(ACTIVITY).toContain('Всё равно тянуть');
    expect(ACTIVITY).toContain('Совет остаётся советом: оба выхода равнозначны, запрета нет.');
  });

  it('абсолютные CTL/ATL не показываются, силовая и кардио не смешиваются', () => {
    expect(ACTIVITY).toContain('Силовая нагрузка · накопленная');
    expect(ACTIVITY).toContain('Кардио — отдельным рядом');
    expect(ACTIVITY).toContain('в одно число с силовой не сводится');
    expect(ACTIVITY).toContain('Абсолютных значений нет намеренно');
    expect(ACTIVITY).not.toMatch(/trainingLoad\.(ctl|atl|tsb)/);
  });
});
