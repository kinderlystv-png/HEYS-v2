'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type PlaybackPhase = 'probing' | 'poster' | 'buffering' | 'playing' | 'paused';

const AUTOPLAY_PROBE_MS = 3500;
const AUTOPLAY_REVEAL_DELAY_MS = 1200;

export default function HeroFlowDemo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseRef = useRef<PlaybackPhase>('probing');
  const [phase, setPhase] = useState<PlaybackPhase>('probing');

  const updatePhase = useCallback((next: PlaybackPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

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
    <div
      className="relative mx-auto aspect-[25/54] w-full max-w-[230px] lg:max-w-[300px]"
      aria-busy={isBusy}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[30px] border-[4px] border-[#111827] bg-white shadow-2xl shadow-[#1e3a8a]/20 lg:rounded-[38px] lg:border-[6px]">
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
          }}
          onWaiting={() => {
            if (phaseRef.current === 'playing') updatePhase('buffering');
          }}
          onPause={() => {
            if (phaseRef.current === 'playing') updatePhase('paused');
          }}
          onError={() => updatePhase('poster')}
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

      {phase !== 'probing' ? (
        <button
          type="button"
          onClick={togglePlayback}
          disabled={phase === 'buffering'}
          className="absolute -right-3 top-3 z-20 flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white/80 bg-white/92 text-[#434587] shadow-[0_8px_20px_rgba(17,24,39,0.16)] backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#434587] focus-visible:ring-offset-2 disabled:cursor-wait lg:h-11 lg:w-11"
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
