'use client';

import { Playfair_Display } from 'next/font/google';
import { useCallback, useEffect, useRef, useState } from 'react';

// Фирменный шрифт отбивок (решение владельца 2026-07-31): контрастная
// антиква с кириллицей. next/font self-host'ит файлы на сборке — внешних
// CDN-запросов в runtime нет (важно для CSP лендинга).
const interstitialFont = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: '500',
  display: 'swap',
});

type PlaybackPhase = 'probing' | 'poster' | 'buffering' | 'playing' | 'paused';

const AUTOPLAY_PROBE_MS = 3500;
const AUTOPLAY_REVEAL_DELAY_MS = 1200;

// Типографские отбивки в демо (`22` п. 3.15, концепт — `маркетинг/45`
// § «Типографские отбивки в демо»): «один кадр — одна фраза» на белом фоне
// между действиями ролика. На таймкоде видео ставится на ПАУЗУ, карточка
// плавно выезжает справа (замедляясь), держится и уезжает влево (разгоняясь),
// после чего воспроизведение продолжается — контент сцены не теряется.
// Тексты — из сценарной таблицы `45`; таймкоды сняты по фактическим
// границам сцен текущего ролика.
const INTERSTITIAL_ENTER_MS = 450;
const INTERSTITIAL_HOLD_MS = 1400;
const INTERSTITIAL_EXIT_MS = 450;
// Влёт: быстрый старт, мягкое торможение. Уход: мягкий старт, разгон.
const INTERSTITIAL_ENTER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const INTERSTITIAL_EXIT_EASING = 'cubic-bezier(0.64, 0, 0.78, 0)';
// Таймкоды выставлены на СТЫКИ сцен (покадровый разбор ffmpeg 2026-07-31),
// чтобы отбивка не разрезала кадр пополам:
//   17.30 — конец экрана с виджетами, следующий кадр (17.35) уже домашний
//           экран с морем;
//   23.15 — последний кадр пуша «Куратор обновил твой дневник» (23.20 — уже
//           экран питания);
//   36.80 — сам переход между «Осталось на сегодня» и недельными виджетами;
//   59.80 — конец диалога про зарядку (60.00 — финальные виджеты).
// Пропуски дефектных отрезков самой записи: на съёмке фото подгружалось по
// сети, и в кадре успевал побыть экран «Загружаю…» и серый плейсхолдер вместо
// блюда. Отрезок вырезается на лету (без перекодирования файла): плеер
// перескакивает на кадр, где фото уже на месте. Границы сняты покадрово.
const FALLBACK_SKIPS: ReadonlyArray<{ from: number; to: number }> = [
  // Границы сняты точным декодом (`ffmpeg -i … -ss`, а не input-seek по
  // ключевым кадрам): 2.62 — экран уже затемнён переходом, но содержимое чата
  // ещё не видно; на 3.95 плейсхолдер ещё серый, на 3.98 фото отрисовано.
  // Анимация открытия чата остаётся, «Загружаю…» и плейсхолдер вырезаются.
  { from: 2.62, to: 3.98 },
];

// `resumeAt` — точка возобновления, если после паузы идёт «доезд» сцены
// (скролл, появление карточек). Пропуск выполняется под плашкой, поэтому
// склейка не видна, а зритель получает уже стабильный кадр.
const FALLBACK_INTERSTITIALS: ReadonlyArray<{ at: number; text: string; resumeAt?: number }> = [
  { at: 17.3, text: 'Прислали — и пошли дальше' },
  { at: 23.15, text: 'Дневник ведёт куратор' },
  { at: 36.8, text: 'Неделя становится понятной' },
  // Виджеты доезжают скроллом до 60.40; без пропуска плашка открывала кадр
  // на ~60.34, и остаточное смещение было заметно.
  { at: 59.8, text: 'Без поспешных выводов', resumeAt: 60.45 },
];

// Разметка ролика лежит рядом с самим файлом (`public/…-chapters.json`), чтобы
// правка таймкодов после перемонтажа не требовала правки кода. Константы выше
// остаются встроенным дефолтом: если JSON не доехал (сеть, кэш, ошибка
// деплоя), публичная страница не должна терять отбивки.
const CHAPTERS_URL = '/hero-curator-demo-chapters.json';
const FALLBACK_EXPECTED_DURATION = 63.8;
const FALLBACK_DURATION_TOLERANCE = 0.35;

interface DemoMarkup {
  expectedDuration: number;
  durationTolerance: number;
  skips: ReadonlyArray<{ from: number; to: number }>;
  interstitials: ReadonlyArray<{ at: number; text: string; resumeAt?: number }>;
  chapters: ReadonlyArray<{ at: number; label: string }>;
}

const FALLBACK_MARKUP: DemoMarkup = {
  expectedDuration: FALLBACK_EXPECTED_DURATION,
  durationTolerance: FALLBACK_DURATION_TOLERANCE,
  skips: FALLBACK_SKIPS,
  interstitials: FALLBACK_INTERSTITIALS,
  chapters: [],
};

interface InterstitialCard {
  text: string;
  leaving: boolean;
}

interface HeroFlowDemoProps {
  /** Внешняя обёртка: пропорции и предельная ширина телефона. */
  containerClassName?: string;
  /** Корпус телефона: рамка, радиус, тень. */
  frameClassName?: string;
  /** Кнопка play/pause: положение и оформление. */
  controlClassName?: string;
  /** Точки-главы под телефоном (версия D). Требуют разметки в JSON. */
  showChapters?: boolean;
}

const DEFAULT_CONTAINER = 'relative mx-auto aspect-[25/54] w-full max-w-[230px] lg:max-w-[300px]';
const DEFAULT_FRAME =
  'absolute inset-0 overflow-hidden rounded-[30px] border-[4px] border-[#111827] bg-white shadow-2xl shadow-[#1e3a8a]/20 lg:rounded-[38px] lg:border-[6px]';
const DEFAULT_CONTROL =
  'absolute -right-3 top-3 z-20 flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white/80 bg-white/92 text-[#434587] shadow-[0_8px_20px_rgba(17,24,39,0.16)] backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#434587] focus-visible:ring-offset-2 disabled:cursor-wait lg:h-11 lg:w-11';

export default function HeroFlowDemo({
  containerClassName = DEFAULT_CONTAINER,
  frameClassName = DEFAULT_FRAME,
  controlClassName = DEFAULT_CONTROL,
  showChapters = false,
}: HeroFlowDemoProps = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseRef = useRef<PlaybackPhase>('probing');
  const [phase, setPhase] = useState<PlaybackPhase>('probing');
  const [card, setCard] = useState<InterstitialCard | null>(null);
  const [chapters, setChapters] = useState<DemoMarkup['chapters']>([]);
  const [activeChapter, setActiveChapter] = useState(0);
  // Разметка ролика и признак того, что она годится для ЭТОГО файла. Держим в
  // ref: её читает покадровый тик, и перерисовка на каждый кадр не нужна.
  const markupRef = useRef<DemoMarkup>(FALLBACK_MARKUP);
  const markupUsableRef = useRef(true);
  // true, пока карточка отбивки на экране. Пока флаг поднят, медиа-события
  // (pause/waiting от нашей же паузы и seek) не меняют фазу: иначе карточка
  // размонтируется вместе с `phase === 'playing'` и при возврате фазы
  // смонтируется заново, повторно проигрывая анимацию влёта.
  const interstitialPauseRef = useRef(false);
  const interstitialTimersRef = useRef<number[]>([]);
  const lastShownAtRef = useRef<number | null>(null);
  // Поднят на время seek-пропуска дефектного отрезка: гасит 'waiting',
  // чтобы не показать постер вместо кадра.
  const skipSeekRef = useRef(false);

  const clearInterstitialTimers = useCallback(() => {
    for (const id of interstitialTimersRef.current) window.clearTimeout(id);
    interstitialTimersRef.current = [];
  }, []);

  const cancelInterstitial = useCallback(() => {
    clearInterstitialTimers();
    interstitialPauseRef.current = false;
    setCard(null);
  }, [clearInterstitialTimers]);

  const checkInterstitial = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || interstitialPauseRef.current) return;
      const t = time;

      // Разметка снята по конкретному монтажу. Если файл заменили и длительность
      // не совпала, таймкоды указывают в никуда: тогда ролик просто играет
      // целиком — эффект пропадает, страница остаётся рабочей.
      if (!markupUsableRef.current) return;

      const markup = markupRef.current;

      if (showChapters && markup.chapters.length > 0) {
        let index = 0;
        for (let i = 0; i < markup.chapters.length; i += 1) {
          if (t >= markup.chapters[i].at) index = i;
        }
        setActiveChapter((prev) => (prev === index ? prev : index));
      }

      // Дефектный отрезок записи пропускаем раньше всего: плеер перескакивает
      // на кадр с уже загруженным фото. `skipSeekRef` гасит `waiting` от seek,
      // иначе фаза уйдёт в 'buffering' и мелькнёт постер.
      const skip = markup.skips.find((item) => t >= item.from && t < item.to);
      if (skip) {
        skipSeekRef.current = true;
        video.currentTime = skip.to;
        return;
      }

      // Loop или перемотка назад — разрешаем показать карточки заново.
      if (lastShownAtRef.current !== null && t < lastShownAtRef.current - 1) {
        lastShownAtRef.current = null;
      }
      if (phaseRef.current !== 'playing') return;

      const next = markup.interstitials.find(
        (item) => t >= item.at && t < item.at + 0.8 && lastShownAtRef.current !== item.at,
      );
      if (!next) return;

      lastShownAtRef.current = next.at;
      interstitialPauseRef.current = true;
      video.pause();
      // Страховка на случай fallback-тика (`timeupdate`, ~4 раза в секунду):
      // возвращаем кадр ровно на границу сцены. При покадровом источнике
      // (`requestVideoFrameCallback`) перебег ≤ одного кадра и отмотка незаметна.
      if (Math.abs(video.currentTime - next.at) > 0.01) video.currentTime = next.at;
      setCard({ text: next.text, leaving: false });
      interstitialTimersRef.current = [
        window.setTimeout(() => {
          setCard((prev) => (prev ? { ...prev, leaving: true } : prev));
          // Воспроизведение возобновляется ВМЕСТЕ с началом ухода, а не после
          // него: плашка уезжает, открывая уже новую сцену. Иначе под уходящей
          // карточкой ещё ~450 мс виден замороженный кадр предыдущей сцены.
          if (next.resumeAt !== undefined) video.currentTime = next.resumeAt;
          void video.play().catch(() => {
            /* пользователь мог поставить паузу — не считаем ошибкой */
          });
        }, INTERSTITIAL_ENTER_MS + INTERSTITIAL_HOLD_MS),
        window.setTimeout(
          () => {
            // Флаг снимается только когда карточка ушла: до этого момента
            // pause/waiting от нашей паузы и seek не должны трогать фазу.
            interstitialPauseRef.current = false;
            setCard(null);
          },
          INTERSTITIAL_ENTER_MS + INTERSTITIAL_HOLD_MS + INTERSTITIAL_EXIT_MS,
        ),
      ];
    },
    [showChapters],
  );

  // Разметка ролика: подхватываем JSON рядом с видео, если он доехал. Ошибку
  // проглатываем намеренно — остаётся встроенный дефолт.
  useEffect(() => {
    let cancelled = false;
    void fetch(CHAPTERS_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Partial<DemoMarkup> | null) => {
        if (cancelled || !data || !Array.isArray(data.interstitials)) return;
        markupRef.current = {
          expectedDuration: data.expectedDuration ?? FALLBACK_EXPECTED_DURATION,
          durationTolerance: data.durationTolerance ?? FALLBACK_DURATION_TOLERANCE,
          skips: data.skips ?? [],
          interstitials: data.interstitials,
          chapters: data.chapters ?? [],
        };
        if (showChapters) setChapters(markupRef.current.chapters);
        // Файл мог загрузиться раньше разметки — перепроверяем длительность.
        const duration = videoRef.current?.duration;
        if (duration && Number.isFinite(duration)) {
          markupUsableRef.current =
            Math.abs(duration - markupRef.current.expectedDuration) <=
            markupRef.current.durationTolerance;
        }
      })
      .catch(() => {
        /* сеть или кэш — работаем на встроенной разметке */
      });
    return () => {
      cancelled = true;
    };
  }, [showChapters]);

  /** Сверка длительности: разметка годится только для того монтажа, по которому снята. */
  const handleLoadedMetadata = useCallback(() => {
    const duration = videoRef.current?.duration;
    if (!duration || !Number.isFinite(duration)) return;
    const markup = markupRef.current;
    markupUsableRef.current =
      Math.abs(duration - markup.expectedDuration) <= markup.durationTolerance;
    if (!markupUsableRef.current) {
      console.warn(
        `[HeroFlowDemo] Длительность ролика ${duration.toFixed(2)}s не совпала с разметкой ` +
          `${markup.expectedDuration}s — отбивки и пропуски отключены.`,
      );
    }
  }, []);

  /** Клик по точке-главе: перематываем на начало главы и сбрасываем отбивку. */
  const jumpToChapter = useCallback(
    (index: number) => {
      const video = videoRef.current;
      const chapter = markupRef.current.chapters[index];
      if (!video || !chapter) return;
      clearInterstitialTimers();
      interstitialPauseRef.current = false;
      setCard(null);
      lastShownAtRef.current = null;
      video.currentTime = chapter.at + 0.1;
      setActiveChapter(index);
      void video.play().catch(() => {
        /* автозапуск мог быть запрещён — состояние не меняем */
      });
    },
    [clearInterstitialTimers],
  );

  // Покадровый источник тика. `timeupdate` срабатывает ~4 раза в секунду, из-за
  // чего пауза наступала уже на первом кадре следующей сцены: зритель успевал
  // увидеть новый фон, и последующая отмотка читалась как моргание.
  // requestVideoFrameCallback даёт время фактически показанного кадра, поэтому
  // перебег не превышает длительности одного кадра.
  const frameHandleRef = useRef<number | null>(null);
  const startFrameLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video?.requestVideoFrameCallback || frameHandleRef.current !== null) return;
    const tick: VideoFrameRequestCallback = (_now, metadata) => {
      frameHandleRef.current = null;
      checkInterstitial(metadata.mediaTime);
      const current = videoRef.current;
      if (current?.requestVideoFrameCallback && !current.paused) {
        frameHandleRef.current = current.requestVideoFrameCallback(tick);
      }
    };
    frameHandleRef.current = video.requestVideoFrameCallback(tick);
  }, [checkInterstitial]);

  useEffect(() => {
    startFrameLoop();
    return () => {
      const video = videoRef.current;
      if (video?.cancelVideoFrameCallback && frameHandleRef.current !== null) {
        video.cancelVideoFrameCallback(frameHandleRef.current);
      }
      frameHandleRef.current = null;
    };
  }, [startFrameLoop]);

  // Fallback для браузеров без requestVideoFrameCallback (например Firefox).
  // В типах DOM метод объявлен всегда, поэтому проверяем именно runtime.
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || typeof video.requestVideoFrameCallback === 'function') return;
    checkInterstitial(video.currentTime);
  }, [checkInterstitial]);

  const updatePhase = useCallback((next: PlaybackPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Страховка от утечки таймеров при размонтировании.
  useEffect(() => clearInterstitialTimers, [clearInterstitialTimers]);

  // Анимации карточки через Web Animations API: влёт стартует синхронно в
  // ref-callback при монтировании (до первого paint — без вспышки и без
  // requestAnimationFrame, который замерзает в фоновых вкладках).
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const attachCardEl = useCallback((el: HTMLDivElement | null) => {
    cardElRef.current = el;
    if (!el) return;
    el.animate([{ transform: 'translateX(105%)' }, { transform: 'translateX(0)' }], {
      duration: INTERSTITIAL_ENTER_MS,
      easing: INTERSTITIAL_ENTER_EASING,
      fill: 'both',
    });
  }, []);

  useEffect(() => {
    if (!card?.leaving || !cardElRef.current) return;
    cardElRef.current.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-105%)' }],
      { duration: INTERSTITIAL_EXIT_MS, easing: INTERSTITIAL_EXIT_EASING, fill: 'both' },
    );
  }, [card?.leaving]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let settled = false;
    let probeTimer = 0;
    let autoplayTimer = 0;

    const showPoster = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(probeTimer);
      window.clearTimeout(autoplayTimer);
      video.pause();
      updatePhase('poster');
    };

    const startAutoplay = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(probeTimer);
      video.currentTime = 0;
      autoplayTimer = window.setTimeout(() => {
        video.currentTime = 0;
        void video.play().then(
          () => updatePhase('playing'),
          () => updatePhase('poster'),
        );
      }, AUTOPLAY_REVEAL_DELAY_MS);
    };

    const handleMotionPreference = () => {
      if (!reducedMotion.matches) return;
      settled = true;
      window.clearTimeout(probeTimer);
      window.clearTimeout(autoplayTimer);
      video.pause();
      updatePhase('poster');
    };

    reducedMotion.addEventListener('change', handleMotionPreference);

    if (reducedMotion.matches) {
      handleMotionPreference();
    } else if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startAutoplay();
    } else {
      video.addEventListener('canplay', startAutoplay, { once: true });
      probeTimer = window.setTimeout(showPoster, AUTOPLAY_PROBE_MS);
      video.load();
    }

    return () => {
      settled = true;
      window.clearTimeout(probeTimer);
      window.clearTimeout(autoplayTimer);
      video.removeEventListener('canplay', startAutoplay);
      reducedMotion.removeEventListener('change', handleMotionPreference);
    };
  }, [updatePhase]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || phase === 'buffering') return;

    if (phase === 'playing') {
      // Ручная пауза во время отбивки: снимаем карточку и её таймеры,
      // чтобы отложенный resume не сработал против воли пользователя.
      cancelInterstitial();
      video.pause();
      updatePhase('paused');
      return;
    }

    updatePhase('buffering');
    void video.play().catch(() => updatePhase('poster'));
  };

  const showCover = phase === 'poster' || phase === 'buffering';
  const isBusy = phase === 'probing' || phase === 'buffering';
  const controlLabel =
    phase === 'playing'
      ? 'Поставить демонстрацию на паузу'
      : phase === 'buffering'
        ? 'Демонстрация загружается'
        : 'Воспроизвести демонстрацию';

  return (
    <div className={containerClassName} aria-busy={isBusy}>
      <div className={frameClassName}>
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          loop
          muted
          playsInline
          preload="auto"
          poster="/hero-curator-demo-poster.jpg"
          aria-label="Демонстрация: клиент пишет куратору, а данные появляются в HEYS"
          onPlaying={() => {
            if (phaseRef.current !== 'probing') updatePhase('playing');
            // Цепочка rVFC обрывается на паузе — поднимаем её заново.
            startFrameLoop();
          }}
          onWaiting={() => {
            // Seek на `resumeAt` под плашкой поднимает waiting: не отдаём
            // фазу в 'buffering', иначе карточка перемонтируется и влетает
            // повторно, не успев уехать. То же для seek-пропуска.
            if (interstitialPauseRef.current || skipSeekRef.current) return;
            if (phaseRef.current === 'playing') updatePhase('buffering');
          }}
          onSeeked={() => {
            skipSeekRef.current = false;
          }}
          onPause={() => {
            // Пауза, вызванная отбивкой, не меняет фазу: для пользователя
            // «фильм» продолжается, кнопка остаётся в состоянии Pause.
            if (interstitialPauseRef.current) return;
            if (phaseRef.current === 'playing') updatePhase('paused');
          }}
          onError={() => updatePhase('poster')}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        >
          <source src="/hero-curator-demo.webm" type="video/webm" />
          <source src="/hero-curator-demo.mp4" type="video/mp4" />
        </video>

        {phase === 'probing' ? (
          <div
            className="absolute inset-0 flex flex-col bg-gradient-to-b from-[#E2ECF2] via-white to-[#FFF8EA] px-[9%] py-[12%]"
            aria-hidden="true"
          >
            <div className="h-[7%] w-[58%] rounded-full bg-white/90 shadow-sm motion-safe:animate-pulse" />
            <div className="mt-[16%] h-[19%] w-[82%] self-end rounded-[14px] bg-[#DDEAF4] motion-safe:animate-pulse" />
            <div className="mt-[8%] h-[13%] w-[62%] rounded-[14px] bg-white shadow-sm motion-safe:animate-pulse" />
            <div className="mt-auto h-[10%] w-full rounded-[16px] border border-[#D8E1E8] bg-white/90 motion-safe:animate-pulse" />
          </div>
        ) : null}

        {phase === 'playing' && card ? (
          <div
            ref={attachCardEl}
            aria-hidden="true"
            data-testid="hero-interstitial"
            className="absolute inset-0 z-10 flex items-center justify-center bg-white px-[11%]"
            style={{ willChange: 'transform' }}
          >
            <p
              className={`${interstitialFont.className} text-center text-[24px] leading-snug text-[#111827] lg:text-[30px]`}
            >
              {card.text}
            </p>
          </div>
        ) : null}

        <img
          src="/hero-curator-demo-poster.jpg"
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            showCover ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          loading="eager"
          fetchPriority="high"
        />
      </div>

      {showChapters && chapters.length > 0 ? (
        <div className="absolute inset-x-0 -bottom-9 flex justify-center gap-0.5">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.at}
              type="button"
              onClick={() => jumpToChapter(index)}
              aria-label={`Перейти к главе: ${chapter.label}`}
              // Точка мелкая, поэтому зона нажатия сделана 34×44 — иначе на
              // телефоне в неё не попасть.
              className="flex h-11 w-[34px] items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full transition-colors duration-[400ms]"
                style={{
                  background: index === activeChapter ? '#7FD1A0' : 'rgba(255,255,255,0.25)',
                }}
              />
            </button>
          ))}
        </div>
      ) : null}

      {phase !== 'probing' ? (
        <button
          type="button"
          onClick={togglePlayback}
          disabled={phase === 'buffering'}
          className={controlClassName}
          style={{
            transform: 'scale(max(1, calc(0.88 / var(--hero-content-scale, 1))))',
          }}
          aria-label={controlLabel}
        >
          {phase === 'buffering' ? (
            <svg
              className="motion-safe:animate-spin"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="9"
                cy="9"
                r="6.5"
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
              <path
                d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : phase === 'playing' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M5 3.5v9M11 3.5v9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
              <path d="m6 4 6 4.5L6 13V4Z" fill="currentColor" />
            </svg>
          )}
        </button>
      ) : null}
    </div>
  );
}
