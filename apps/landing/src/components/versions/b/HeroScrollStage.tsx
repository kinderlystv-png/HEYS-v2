// HeroScrollStage.tsx — первый экран версии B: демо разворачивается при прокрутке.
//
// Приём разобран в `маркетинг/45`, раздел «Скролл-механика Future». Два отличия
// от версии A задают всю конструкцию:
//   1. текст стоит НАД роликом — иначе растущему ролику некуда идти, кроме как
//      в заголовок и кнопку под ним;
//   2. ничего не закрепляется, кроме фона. Липнет только фоновый слой высотой
//      в экран, а шапка, текст, ролик и CTA прокручиваются как обычный контент
//      (`-mt-[100dvh]` поверх липкого фона — схема Future). Поэтому нет
//      «мёртвой» прокрутки: на каждом пикселе что-то движется.
//
// Единственное, что привязано к прокрутке, — масштаб ролика: 301 → 340 px, те
// же числа, что у Future на мобильном. Крупный старт (около четверти кадра за
// нижним краем экрана) делает работу «показать детали», а сам скачок масштаба
// остаётся незаметным. Обратного уменьшения нет — у Future в hero его тоже нет.
//
// Масштаб идёт `transform` (не `width`, как у Future): у них под телефоном
// ничего нет, а у нас там CTA, и рост по ширине двигал бы его на каждом кадре.
// Значение пишется в CSS-переменную из `requestAnimationFrame` — без
// React-рендера на кадре и без чтения раскладки на прокрутке.

'use client';

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

import HeroFlowDemo from '@/components/HeroFlowDemo';
import LandingHeader from '@/components/LandingHeader';
import LandingNav, { useLandingNav } from '@/components/LandingNav';
import { type VariantContent } from '@/config/landing-variants';

interface HeroScrollStageProps {
  content: VariantContent;
}

/**
 * Доля прокрутки первого экрана, на которой ролик достиг предела. Подобрана так,
 * чтобы рост занимал примерно те же ~270 px хода, что и у Future.
 */
const GROW_END = 0.6;
/** Ширина развёрнутого ролика — значение Future на мобильном брейкпоинте. */
const MAX_WIDTH_PX = 340;
/** Предохранитель для узких экранов: ролик не должен упираться в края. */
const MAX_WIDTH_RATIO = 0.94;
/** Запас по высоте, чтобы развёрнутый ролик не перекрывал экран целиком. */
const HEIGHT_PADDING = 24;

/**
 * Подпись под главной кнопкой. Живёт здесь, а не в контенте варианта: это
 * копирайт первого экрана версии B, а `VariantContent` описывает вариант A и
 * развивается параллельно. Задача строки — сказать, что человек увидит по
 * переходу, без обещаний и без повтора условий бесплатной недели.
 */
const CTA_NOTE = 'От самостоятельного режима до работы с тренером';

export default function HeroScrollStage(props: HeroScrollStageProps) {
  // Навигация живёт над версиями страницы: если версия не обернула себя в
  // LandingNav, поднимаем его здесь — так же, как это делает hero версии A.
  const nav = useLandingNav();
  if (nav) return <Stage {...props} />;
  return (
    // Первый экран версии B выше обычного (в нём помещается ролик целиком),
    // поэтому залипающую шапку отпускаем позже — иначе она выедет поверх сцены.
    <LandingNav links={props.content.nav.links} pastHeroFactor={1.3}>
      <Stage {...props} />
    </LandingNav>
  );
}

function Stage({ content }: HeroScrollStageProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);

  // Всё, что нужно на каждом кадре, считается один раз при измерении: на самой
  // прокрутке не должно быть ни одного чтения раскладки.
  const metricsRef = useRef({ active: false, top: 0, travel: 1, maxScale: 1 });
  const rafRef = useRef(0);

  const [mounted, setMounted] = useState(false);

  const ctaHref = content.hero.ctaPrimaryHref ?? '#curator';

  const apply = useCallback((progress: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const { active, maxScale } = metricsRef.current;

    const grow = active ? Math.min(1, Math.max(0, progress / GROW_END)) : 0;
    // Мягкий старт и мягкий финал: линейный рост читается как рывок в первых же
    // пикселях прокрутки, а торможение только в конце — как «дёрнулось и село».
    const eased = grow * grow * (3 - 2 * grow);
    const scale = 1 + (maxScale - 1) * eased;

    section.style.setProperty('--hb-scale', scale.toFixed(4));
    // Кнопка воспроизведения не должна раздуваться вместе с роликом: она
    // элемент интерфейса страницы, а не часть кадра.
    section.style.setProperty('--hb-inverse', (1 / scale).toFixed(4));
  }, []);

  const measure = useCallback(() => {
    const section = sectionRef.current;
    const demo = demoRef.current;
    if (!section || !demo) return;

    // Эффект включается только там, где он даёт заметный результат: на широком
    // экране портретный кадр упирается в высоту окна и вырастает на единицы
    // процентов, а при `prefers-reduced-motion` движения быть не должно вовсе.
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const active = !wide && !reduced;

    // offsetWidth/offsetHeight не учитывают текущий transform, поэтому дают
    // исходный размер ролика даже посреди анимации.
    const demoWidth = demo.offsetWidth;
    const demoHeight = demo.offsetHeight;
    const viewport = window.innerHeight;

    const targetWidth = Math.min(MAX_WIDTH_PX, MAX_WIDTH_RATIO * window.innerWidth);
    const byWidth = demoWidth > 0 ? targetWidth / demoWidth : 1;
    const byHeight = demoHeight > 0 ? (viewport - HEIGHT_PADDING) / demoHeight : 1;

    const maxScale = active ? Math.max(1, Math.min(byWidth, byHeight)) : 1;

    // Масштаб — трансформация, раскладка о нём не знает: увеличенный ролик
    // свешивается вниз на половину прироста высоты и наезжает на кнопку.
    // Резервируем этот запас один раз при измерении, а не на каждом кадре:
    // менять отступ покадрово значило бы пересчитывать раскладку на прокрутке.
    section.style.setProperty(
      '--hb-reserve',
      `${(((maxScale - 1) * demoHeight) / 2).toFixed(1)}px`,
    );

    metricsRef.current = {
      active,
      top: section.getBoundingClientRect().top + window.scrollY,
      travel: Math.max(1, section.offsetHeight - viewport),
      maxScale,
    };
  }, []);

  const update = useCallback(() => {
    const { active, top, travel } = metricsRef.current;
    if (!active) {
      apply(0);
      return;
    }
    apply(Math.min(1, Math.max(0, (window.scrollY - top) / travel)));
  }, [apply]);

  useEffect(() => {
    const schedule = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        update();
      });
    };
    const remeasure = () => {
      measure();
      schedule();
    };

    remeasure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    window.visualViewport?.addEventListener('resize', remeasure);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', remeasure);

    // Высота ролика уточняется после загрузки постера и метаданных видео, а
    // высота текста — после появления шрифтов; пересчёт по кадру этого не ловит.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    if (sectionRef.current) observer?.observe(sectionRef.current);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      window.visualViewport?.removeEventListener('resize', remeasure);
      motion.removeEventListener('change', remeasure);
      observer?.disconnect();
    };
  }, [measure, update]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full"
      style={{ '--hb-scale': 1, '--hb-inverse': 1 } as CSSProperties}
    >
      {/* Стиль держим рядом с компонентом: он относится только к версии B и не
          должен попадать в общий globals.css. `!important` обязателен — у кнопки
          в HeroFlowDemo свой inline-transform из версии A, а inline сильнее
          обычного правила. Второе правило снимает собственный `max-width` демо:
          здесь размером управляет обёртка, ролик стартует крупным. */}
      <style>{`.hero-b-demo button { transform: scale(var(--hb-inverse, 1)) !important; transform-origin: center; }
.hero-b-demo > * { max-width: none !important; aspect-ratio: 301 / 608 !important; }
.hero-b-demo video, .hero-b-demo img { object-position: 50% 0% !important; }
.hero-b-bg .hero-brand-plus-pattern { opacity: 0.28; background-image: url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 5.5c.9 4.1.9 4.1 5 4.9-4.1.9-4.1.9-5 5-.9-4.1-.9-4.1-5-5 4.1-.8 4.1-.8 5-4.9Z' fill='%23FFFFFF'/%3E%3C/svg%3E"); }
.hero-b-head { --hero-mobile-header-y: clamp(14px, 2dvh, 20px); }
.hero-b-head img { filter: brightness(0) invert(1); }
.hero-b-head button span { background-color: #ffffff !important; }
.hero-b-head nav a { color: rgba(255, 255, 255, 0.85) !important; }`}</style>

      {/* Единственный закреплённый слой — фон. Всё остальное прокручивается как
          обычный контент, поэтому «зависания» прокрутки нет. */}
      <div className="hero-b-bg sticky top-0 h-dvh w-full overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          // Градиент версии B идёт в обратную сторону против версии A: сверху
          // светло, книзу глубже. Светлый верх нужен тёмному заголовку, а
          // потемнение к низу отделяет мокап от фона — на белом его тёмная
          // рамка сливалась с краем экрана.
          style={{
            background:
              'linear-gradient(180deg, #2F6E9E 0%, #27618C 38%, #1E4C71 72%, #163A57 100%)',
          }}
        />
        <div className="hero-brand-plus-pattern absolute inset-0" />
      </div>

      <div className="relative -mt-[100dvh] flex min-h-dvh w-full flex-col pb-[10dvh] lg:pb-10">
        {/* Шапка общая для всех версий и нарисована под светлый фон, поэтому в
            версии B логотип, бургер и ссылки перекрашиваются в белый локально —
            общий компонент не трогаем. */}
        <div className="hero-b-head">
          <LandingHeader
            links={content.nav.links}
            className={`transition-all duration-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>

        {/* Воздух над заголовком — как у Future: первый экран начинается не
            вплотную под шапкой, иначе текст читается как продолжение меню. */}
        <div className="flex w-full flex-col items-center px-4 pt-2 md:px-6 md:pt-8">
          {/* Колонка текста уже ширины экрана: на всю ширину строка тянется до
              краёв и читается как сплошная плита. Ролик остаётся шире текста —
              так он и остаётся главным на первом экране. */}
          <div className="w-full max-w-[305px] text-center sm:max-w-[420px] md:max-w-[560px]">
            <h1
              className={`text-balance text-[26px] font-semibold leading-[1.15] text-white transition-all duration-700 ease-out sm:text-[28px] md:text-[36px] ${
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
              }`}
              style={{ transitionDelay: '400ms' }}
            >
              {content.hero.headline}
            </h1>

            <p
              className={`mt-3 text-[14px] font-normal leading-[1.5] text-white/85 transition-all duration-700 ease-out md:mt-5 md:text-[16px] md:leading-[1.6] ${
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
              }`}
              style={{ transitionDelay: '800ms' }}
            >
              {content.hero.subheadline}
            </p>
          </div>

          {/* Условия входа — плашкой между описанием и роликом. У Future на том
              же месте стоит строка с ценой и условием отмены: человек видит
              цену до того, как начнёт разбираться в продукте. Формулировка
              берётся из контента варианта, отдельного текста здесь нет. */}
          {content.hero.microtext ? (
            <div
              className={`mt-7 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.12] px-3.5 py-2 text-[11.5px] backdrop-blur-sm transition-all duration-700 ease-out md:px-4 md:text-[13px] ${
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
              }`}
              style={{ transitionDelay: '1000ms' }}
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7FD1A0]" />
              {(() => {
                const [offer, ...rest] = content.hero.microtext.split(' · ');
                return (
                  <>
                    <span className="font-semibold text-white">{offer}</span>
                    {rest.length ? (
                      <span className="text-white/70">{`· ${rest.join(' · ')}`}</span>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}

          {/* Ролик — под текстом и намеренно обрезан нижним краем экрана: у
              Future это же положение работает подсказкой «здесь прокрутка». */}
          <div
            ref={demoRef}
            className={`hero-b-demo mt-[7vh] w-[301px] max-w-[86vw] transition-opacity duration-700 ease-out md:mt-[5vh] lg:w-[280px] ${
              mounted ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: 'scale(var(--hb-scale, 1))',
              transformOrigin: 'center center',
              willChange: 'transform',
              transitionDelay: '600ms',
            }}
          >
            <HeroFlowDemo />
          </div>

          {/* Единственный CTA на первом экране — под роликом. Дублировать кнопку
              над и под демо не стали: одно действие, показанное после
              доказательства, читается честнее (решение владельца 2026-08-01). */}
          <div
            className={`flex w-full flex-col items-center transition-all duration-700 ease-out ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
            }`}
            style={{
              marginTop: 'calc(2rem + var(--hb-reserve, 0px))',
              transitionDelay: '1200ms',
            }}
          >
            <a
              href={ctaHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-[14px] font-semibold tracking-wide text-[#1B4E75] shadow-[0_12px_28px_rgba(8,32,52,0.28)] transition-all hover:bg-[#EDF5FB]"
            >
              {content.hero.ctaPrimary}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h14m-7-7 7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            {/* Строка под кнопкой отвечает на «что я увижу, если нажму»: она
                снижает трение перед переходом и держит композицию — иначе
                кнопка висит в пустоте над краем экрана. Условия бесплатной
                недели здесь не повторяем, они уже стоят плашкой над роликом. */}
            <p className="mt-3 max-w-[240px] text-balance text-center text-[clamp(11px,3.1vw,12.5px)] text-white/70 md:max-w-[280px] md:text-[13px]">
              {CTA_NOTE}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
