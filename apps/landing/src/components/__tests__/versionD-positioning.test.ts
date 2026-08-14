// Позиционирование версии D — то, что нельзя потерять при правках.
//
// УТП страницы — вникание, и держится оно на одном маркере: куратор уточняет,
// ПРЕЖДЕ чем советовать. Маркер проведён через пять точек; handoff прямо
// предупреждает, что если хоть одна выпадет, страница вернётся к защите
// копируемого — снятой рутины, которую через год повторит любой сервис с
// ассистентом (`design/landing-d/README.md` § «Позиционирование», решение
// владельца `маркетинг/15` №50).
//
// Тест читает исходники, а не рендерит их: проверяются формулировки, и такая
// проверка не должна падать из-за окружения (`next/font`, jsdom, разметка).
// Регресс здесь выглядит как «текст переписали и стало красивее» — глазами в
// диффе он не ловится.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const D_DIR = path.resolve(__dirname, '../versions/d');
const QUIZ_DIR = path.resolve(__dirname, '../quiz');

/**
 * Читает исходник со схлопнутыми пробелами. Без этого проверки ломались бы от
 * форматирования: prettier переносит длинные строки JSX, и фраза целиком в
 * файле не встречается ни разу, хотя на экране она одна.
 */
const read = (dir: string, file: string) =>
  readFileSync(path.join(dir, file), 'utf8').replace(/\s+/g, ' ');

describe('пять точек вникания', () => {
  it('1. подзаголовок героя обещает память о прошлой неделе и вопрос до совета', () => {
    const hero = read(D_DIR, 'HeroD.tsx');
    expect(hero).toContain('помнит, что было на прошлой неделе');
    expect(hero).toContain('спрашивает, прежде чем советовать');
  });

  it('2. в переписке куратор задаёт вопрос ДО вывода, а клиент на него отвечает', () => {
    const section = read(D_DIR, 'HowItWorks.tsx');

    // Вопрос именно про причину, а не про факт: факты куратор вносит сам и
    // спрашивать о них не может — иначе диалог отрицает, что дневник ведёт он.
    const question = section.indexOf('или что-то новое?');
    const answer = section.indexOf('Перехватываю на бегу');
    const step = section.indexOf('вернём полноценный обед');

    expect(question).toBeGreaterThan(-1);
    expect(answer).toBeGreaterThan(-1);
    expect(step).toBeGreaterThan(-1);
    // Порядок реплик и есть доказательство: готовый разбор без уточнения
    // умеет выдавать и алгоритм.
    expect(question).toBeLessThan(answer);
    expect(answer).toBeLessThan(step);
  });

  it('3. в артефакте недели есть отдельный узел «что уточнил куратор»', () => {
    const week = read(D_DIR, 'ReviewedWeek.tsx');
    const noticed = week.indexOf('Что заметил куратор');
    const asked = week.indexOf('Что уточнил куратор');
    const next = week.indexOf('Следующий шаг');

    expect(asked).toBeGreaterThan(-1);
    // Наблюдение → уточнение → шаг. Если уточнение уедет после шага, узел
    // перестанет быть доказательством и станет комментарием.
    expect(noticed).toBeLessThan(asked);
    expect(asked).toBeLessThan(next);
  });

  it('4. секция доверия называет вникание стандартом работы, а не обещанием', () => {
    expect(read(D_DIR, 'CuratorSection.tsx')).toContain('не обещание, а');
  });

  it('5. карточка заявки обещает опыт вникания, а не снятую рутину', () => {
    expect(read(D_DIR, 'TrialSection.tsx')).toContain('в вашу неделю действительно вникают');
  });
});

describe('формулировки, закреплённые решением владельца', () => {
  const withMinutes = [
    ['HeroD.tsx', D_DIR],
    ['HowItWorks.tsx', D_DIR],
    ['FaqD.tsx', D_DIR],
  ] as const;

  it.each(withMinutes)('%s смягчает время клиента словом «обычно»', (file, dir) => {
    const source = read(dir, file);

    // Каждое упоминание числа должно быть смягчено: «обычно» стоит рядом, но
    // не обязательно вплотную («обычно это до 3 минут в день» — тоже верно).
    const mentions = [...source.matchAll(/до 3 минут/g)];
    expect(mentions.length).toBeGreaterThan(0);

    for (const mention of mentions) {
      const before = source.slice(Math.max(0, (mention.index ?? 0) - 40), mention.index);
      // Голое «до 3 минут в день» читается как обещание сервиса — решение
      // владельца 2026-08-02 (`15` №50). Само число уточнено 2026-08-08:
      // по практике первых недель это до 3 минут, а не 3–5.
      expect(before).toMatch(/обычно/i);
    }
  });

  it('слово «забота» не употребляется в клиентском тексте', () => {
    // Заявленная забота дешёвая, показанная — дорогая (`COPY_VOICE`).
    for (const file of [
      'HeroD.tsx',
      'PainSection.tsx',
      'HowItWorks.tsx',
      'FirstMonth.tsx',
      'ReviewedWeek.tsx',
      'CuratorSection.tsx',
      'PricingD.tsx',
      'TrialSection.tsx',
      'FaqD.tsx',
    ]) {
      expect(read(D_DIR, file)).not.toMatch(/забот/i);
    }
  });

  it('первая body-заявка после артефакта недели, а не сразу после «Знакомо?»', () => {
    const pain = read(D_DIR, 'PainSection.tsx');
    const week = read(D_DIR, 'ReviewedWeek.tsx');
    expect(pain).not.toContain('PrimaryCta');
    expect(pain).not.toContain('#trial');
    expect(week).toContain('D_CTA_LABEL');
    expect(week).toContain('D_CTA_HREF');
  });

  it('Pro Спорт не продаёт founder-led / основателя во внешнем тексте', () => {
    const pricing = read(D_DIR, 'PricingD.tsx');
    expect(pricing).not.toMatch(/founder/i);
    expect(pricing).not.toMatch(/основател/i);
  });

  it('FAQ отвечает про живого человека и не выдаёт AI за куратора', () => {
    const faq = read(D_DIR, 'FaqD.tsx');
    expect(faq).toContain('живой человек или AI');
    expect(faq).toContain('Живой человек.');
    expect(faq).toContain('Автоматических советов HEYS не выдаёт.');
  });

  it('FAQ про общение указывает мессенджер приложения, а не внешние каналы', () => {
    const faq = read(D_DIR, 'FaqD.tsx');
    expect(faq).toContain('В мессенджере HEYS внутри приложения — рядом с дневником');
    expect(faq).toContain('фото и голосовые не теряются между перепиской и записью еды');
    expect(faq).toContain('09:00–21:00 МСК');
    expect(faq).not.toContain('или в привычном вам');
  });

  it('ёмкость набора описана без счётчика мест', () => {
    const trial = read(D_DIR, 'TrialSection.tsx');
    expect(trial).toContain('ограниченное число участников');
    // Фейковый дефицит рядом с блоком о возвратах подрывает доверие, на
    // котором держится вся страница (`COPY_VOICE` § Лендинг).
    expect(trial).not.toMatch(/осталось\s+\d|\d+\s+из\s+\d+/i);
  });

  it('квиз не обещает результата по весу и срокам', () => {
    const quiz = read(QUIZ_DIR, 'TrialQuiz.tsx');
    // Запрещена гарантия, а не слово: «не гарантирует» — это как раз снятие
    // обещания, и именно оно обязано стоять под кнопкой.
    expect(quiz).not.toMatch(/(?<!не )гарантир/i);
    expect(quiz).not.toMatch(/−\s?\d+\s?кг/i);
    expect(quiz).toContain('Заявка не гарантирует начало пробной недели');
  });
});

describe('цены и реквизиты не хардкодятся', () => {
  it('тарифы берут числа из PRICING', () => {
    const pricing = read(D_DIR, 'PricingD.tsx');
    expect(pricing).toContain("from '@/config/pricing'");
    // Собственные цены страницы должны приходить из конфига: их синхронность с
    // legal-документами стережёт pre-commit `check-pricing-sync`.
    expect(pricing).not.toMatch(/[^\d]7\s?990[^\d]/);
    expect(pricing).not.toMatch(/[^\d]19\s?990[^\d]/);
    expect(pricing).not.toMatch(/[^\d]490[^\d]/);
  });

  it('футер берёт реквизиты оператора из конфига', () => {
    const footer = read(D_DIR, 'FooterD.tsx');
    expect(footer).toContain("from '@/config/legal-versions'");
    expect(footer).not.toContain('263517141102');
  });
});
