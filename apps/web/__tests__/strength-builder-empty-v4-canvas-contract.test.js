import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const source = fs.readFileSync(path.join(WEB, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const daySource = fs.readFileSync(path.join(WEB, 'heys_day_trainings_v1.js'), 'utf8');
const dayNormSource = fs.readFileSync(path.join(WEB, 'heys_day_norm_v1.js'), 'utf8');
const strengthKernelSource = fs.readFileSync(path.join(WEB, '_kernel/heys_kernel_strength_v1.js'), 'utf8');
const tdeeSource = fs.readFileSync(path.join(WEB, 'heys_tdee_v1.js'), 'utf8');
const iwSource = fs.readFileSync(path.join(WEB, 'heys_iw_constants.js'), 'utf8');
const css = fs.readFileSync(path.join(WEB, 'styles/modules/750-strength-builder.css'), 'utf8');

describe('strength builder · Б1 empty v4 canvas contract', () => {
  it('keeps the exact empty-state copy and hierarchy without decorative noise', () => {
    expect(source).toContain("'Силовая'");
    expect(source).toContain("'пусто · 0 подходов'");
    expect(source).toContain("'Пустая тренировка'");
    expect(source).toContain("'Добавляйте упражнения по ходу — план не обязан быть готов заранее.'");
    expect(source).toContain("'Начать по плану' + (planLabel ? ' · ' + planLabel : '')");
    expect(source).toContain("emptyActionPending ? 'Начинаем…' : 'Собрать свою'");
    expect(source).toContain("'Повторить ' + repeatDateLabel(last.dateKey)");
    expect(source).not.toContain("h('div', { className: 'sb-empty-emoji' }");
  });

  it('uses the canvas geometry for scroll, card, actions, options and note', () => {
    expect(css).toMatch(/\.sb-root\s*\{[\s\S]*font-family: Figtree, -apple-system, system-ui, sans-serif;/);
    expect(css).toMatch(/\.sb-head\.is-empty\s*\{[\s\S]*position: relative;/);
    expect(css).toMatch(/\.sb-head\.is-empty \.sb-icon-btn\s*\{[\s\S]*position: absolute;[\s\S]*top: 16px;[\s\S]*right: 18px;/);
    expect(css).toMatch(/\.sb-empty-scroll\s*\{[\s\S]*padding: 7px 18px 18px;/);
    expect(css).toMatch(/\.sb-empty-card\s*\{[\s\S]*margin-top: 12px;[\s\S]*border-radius: 20px;/);
    expect(css).toMatch(/\.sb-empty-card b\s*\{[\s\S]*font-size: 15px;[\s\S]*line-height: 1\.32;[\s\S]*font-weight: 700;/);
    expect(css).toMatch(/\.sb-empty-action\s*\{[\s\S]*min-height: 48px;[\s\S]*margin-top: 10px;[\s\S]*border-radius: 999px;/);
    expect(css).toMatch(/\.sb-empty-action:not\(\.is-primary\)\s*\{[\s\S]*font-weight: 700;/);
    expect(css).toMatch(/\.sb-empty-options\s*\{[\s\S]*margin-top: 10px;[\s\S]*padding: 2px 16px;[\s\S]*border-radius: 20px;/);
    expect(css).toMatch(/\.sb-empty-note\s*\{[\s\S]*margin: 12px 0 0;[\s\S]*font-size: 11px;[\s\S]*line-height: 1\.55;/);
  });

  it('does not let the OS dark preference override an explicit v4 palette', () => {
    expect(css).toContain("html:not([data-theme]) .sb-root");
    expect(css).not.toContain("html:not([data-theme='light']) .sb-root");
    expect(css).toContain("[data-theme='dark'] .sb-root");
  });

  it('fails closed when the plan has no usable snapshot or owner callback', () => {
    expect(source).toContain("if (!plan || plan.status !== 'assigned' || !source.length) return null;");
    expect(source).toContain('const planWasConsumed = samePlanRevision(consumedPlanRevision, planRevision);');
    expect(source).toContain("const canStartPlan = !!(candidatePlan && !planWasConsumed && typeof onStartPlan === 'function');");
    expect(source).toContain("last && Array.isArray(last.exercises) && last.exercises.length > 0 && typeof onRepeatLast === 'function'");
  });

  it('keeps plan lifecycle and exercise persistence under the day owner', () => {
    expect(daySource).toContain('onStartPlan: function (expectedPlan)');
    expect(daySource).toContain('onStartCustom: function (expectedPlan)');
    expect(daySource).toContain('matchesOpenedPlanRevision(t0, expectedPlan)');
    expect(daySource).toContain('onRepeatLast: function (srcExercises, expectedPlan)');
    expect(daySource).toContain('return patchTrainingAcknowledged(ti, function (t0)');
    expect(daySource).toContain('const startedExercises = cloneExercisesForReplay(source);');
    expect(daySource).toContain('ack.resolve(null);');
    expect(daySource).toContain("plan: { ...t0.plan, status: 'started' }");
    expect(source).toContain('onStartPlan: state.onStartPlan');
    expect(source).toContain('onStartCustom: state.onStartCustom');
    expect(daySource).toContain("const assignedDraft = rawT.plan && rawT.plan.status === 'assigned';");
    expect(daySource).toContain("? { ...wlLive, zoneMinutes: [0, 0, 0, 0], exercises: [] }");
    expect(daySource).toContain("rawT.plan.status === 'moved'");
  });

  it('fails plan outcome actions closed on stale revision and rolls back only their new move target', () => {
    expect(daySource).toContain('onMove: function (toDate, expectedPlan)');
    expect(daySource).toContain("String(toDate) <= String(dateKey)");
    expect(daySource).toContain("matchesOpenedPlanRevision(t0, expectedPlan, 'assigned', rawT.updatedAt)");
    expect(daySource).toContain('hasMeaningfulLiveWorkout(t0) || !source.length');
    expect(daySource).toContain('return patchTrainingAcknowledged(ti, function (cur)');
    expect(daySource).toContain('|| hasMeaningfulLiveWorkout(cur)) return null;');
    expect(daySource).toContain('removeTrainingFromDayById(toDate, targetTrainingId, moveTransferId)');
    expect(daySource).toContain('onSkip: function (skipReason, expectedPlan)');
    expect(daySource).toContain("matchesOpenedPlanRevision(t0, expectedPlan, 'skipped', rawT.updatedAt)");
  });

  it('treats moved as not performed in every web path and load fallback', () => {
    expect(daySource.match(/return status === 'assigned' \|\| status === 'skipped' \|\| status === 'moved';/g)).toHaveLength(2);
    expect(dayNormSource).toContain("['assigned', 'skipped', 'moved'].includes(t.plan.status)");
    expect(strengthKernelSource).toContain("['assigned', 'skipped', 'moved'].indexOf(t.plan.status) !== -1");
    expect(tdeeSource).toContain("['assigned', 'skipped', 'moved'].indexOf(training.plan.status) !== -1");
    expect(iwSource).toContain("['assigned', 'skipped', 'moved'].indexOf(t.plan.status) !== -1");
  });
});
