// heys_drums_notation_v1.js — lightweight rolling SVG notation for the drums trainer.
;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const DFC = (Hobby._drumsInternal = Hobby._drumsInternal || {});
  const React = global.React;

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const { getNotationWindow } = DFC;

  const NOTE_GAP = 32;
  const STAFF_LEFT = 42;
  const STAFF_RIGHT = 22;
  const ACTIVE_Y = 54;
  const PREVIEW_Y = 150;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function getNoteX(index) {
    return STAFF_LEFT + index * NOTE_GAP;
  }

  function getWindowWidth(count) {
    return Math.max(360, STAFF_LEFT + STAFF_RIGHT + Math.max(1, count) * NOTE_GAP);
  }

  function mutateActiveNote(svg, absoluteIndex) {
    if (!svg) return;
    const prev = svg.querySelector('.drums-ft-note-mark.is-now');
    if (prev) prev.classList.remove('is-now');
    const next = svg.querySelector('[data-note-index="' + absoluteIndex + '"]');
    if (next) next.classList.add('is-now');
  }

  function getCurrentScheduledNote(cursor, currentTime) {
    const queue = Array.isArray(cursor?.scheduledNotes) ? cursor.scheduledNotes : [];
    if (!queue.length) return null;
    while (queue.length > 2 && Number(queue[1]?.time) <= currentTime - 0.001) queue.shift();
    let active = queue[0];
    let next = queue[1] || null;
    for (let i = 0; i < queue.length; i++) {
      if (Number(queue[i]?.time) <= currentTime) {
        active = queue[i];
        next = queue[i + 1] || null;
      } else {
        break;
      }
    }
    if (!active || Number(active.time) > currentTime) return null;
    return {
      index: Math.max(0, Math.floor(Number(active.index) || 0)),
      time: Number(active.time) || currentTime,
      nextTime: Number(next?.time) || Number(cursor.nextNoteTime) || currentTime + 0.1,
    };
  }

  function NotationPanel(props) {
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;
    const {
      session,
      blockIndex,
      metronomeRef,
      running,
      countInSec,
      results,
    } = props || {};
    const [visualNoteIndex, setVisualNoteIndex] = useState(0);
    const cursorRef = useRef(null);
    const svgRef = useRef(null);
    const windowRef = useRef(null);

    useEffect(
      function () {
        setVisualNoteIndex(0);
      },
      [session?.id, blockIndex]
    );

    const notation = useMemo(
      function () {
        return getNotationWindow(session, blockIndex, visualNoteIndex, { results });
      },
      [session, blockIndex, visualNoteIndex, results]
    );
    windowRef.current = notation;

    useEffect(
      function () {
        if (!running || countInSec) return undefined;
        let raf = 0;
        let lastWindowStart = notation.activeStart;
        function frame() {
          const cursor = metronomeRef?.current || {};
          const ctx = cursor.ctx;
          const scheduled = ctx ? getCurrentScheduledNote(cursor, Number(ctx.currentTime) || 0) : null;
          const currentIndex = scheduled ? scheduled.index : Math.max(0, Math.floor(Number(cursor.noteIndex) - 1 || 0));
          const currentWindow = windowRef.current || notation;
          const windowNotes = Math.max(1, currentWindow.windowNotes || 1);
          const activeStart = Math.floor(currentIndex / windowNotes) * windowNotes;
          if (activeStart !== lastWindowStart) {
            lastWindowStart = activeStart;
            setVisualNoteIndex(currentIndex);
          }

          if (ctx && scheduled && cursorRef.current && currentIndex >= currentWindow.activeStart) {
            const noteOffset = Math.max(0, currentIndex - currentWindow.activeStart);
            const span = Math.max(0.001, Number(scheduled.nextTime) - Number(scheduled.time));
            const phase = clamp01((Number(ctx.currentTime) - Number(scheduled.time)) / span);
            const x = getNoteX(noteOffset + phase);
            cursorRef.current.setAttribute('transform', 'translate(' + x.toFixed(2) + ' 0)');
            mutateActiveNote(svgRef.current, currentIndex);
          }
          raf = global.requestAnimationFrame(frame);
        }
        raf = global.requestAnimationFrame(frame);
        return function () {
          global.cancelAnimationFrame(raf);
        };
      },
      [running, countInSec, notation.activeStart, metronomeRef]
    );

    const width = getWindowWidth(notation.windowNotes);
    const activeTitle = 'Сейчас · ' + (notation.active[0]?.blockLabel || '');
    const previewTitle =
      (notation.previewIsNextBlock ? 'Дальше · ' : 'Следующие 2 такта · ') + (notation.preview[0]?.blockLabel || '');

    function renderStaff(y, notes, mode) {
      return h(
        'g',
        { className: 'drums-ft-notation__staff drums-ft-notation__staff--' + mode },
        h('line', { x1: STAFF_LEFT - 14, x2: width - STAFF_RIGHT + 4, y1: y, y2: y }),
        notes.map(function (note, index) {
          const x = getNoteX(index);
          const isRight = note.sticking === 'R';
          const isLeft = note.sticking === 'L';
          return h(
            'g',
            {
              key: mode + '-' + note.blockId + '-' + note.absoluteIndex + '-' + index,
              className:
                'drums-ft-note-mark' +
                (note.rest ? ' is-rest' : '') +
                (note.accent ? ' is-accent' : '') +
                (isRight ? ' is-right' : isLeft ? ' is-left' : ''),
              transform: 'translate(' + x + ' 0)',
              'data-note-index': mode === 'active' ? note.absoluteIndex : null,
            },
            note.isBarStart ? h('line', { className: 'drums-ft-notation__barline', x1: -10, x2: -10, y1: y - 24, y2: y + 24 }) : null,
            note.bpmMarker ? h('text', { className: 'drums-ft-notation__bpm', x: -4, y: y - 34 }, note.bpmMarker) : null,
            note.accent ? h('text', { className: 'drums-ft-notation__accent', x: -5, y: y - 27 }, '>') : null,
            note.rest
              ? h('path', { className: 'drums-ft-notation__rest', d: 'M-7 ' + (y - 10) + ' L7 ' + (y - 2) + ' L-5 ' + (y + 10) })
              : h(
                  'g',
                  null,
                  h('ellipse', { className: 'drums-ft-notation__note-head', cx: 0, cy: y, rx: note.accent ? 7 : 6, ry: note.accent ? 5 : 4 }),
                  h('line', { className: 'drums-ft-notation__stem', x1: 6, x2: 6, y1: y, y2: y - 28 })
                ),
            h('text', { className: 'drums-ft-notation__stick', x: -5, y: y + 29 }, note.rest ? '—' : note.sticking || '')
          );
        }),
        mode === 'active'
          ? h('g', { ref: cursorRef, className: 'drums-ft-notation__cursor', transform: 'translate(' + STAFF_LEFT + ' 0)' }, h('line', { x1: 0, x2: 0, y1: y - 42, y2: y + 42 }))
          : null
      );
    }

    return h(
      'section',
      { className: 'drums-ft-notation' + (running ? ' is-running' : '') + (countInSec ? ' is-count-in' : '') },
      h(
        'div',
        { className: 'drums-ft-notation__head' },
        h('div', null, h('strong', null, activeTitle), h('span', null, countInSec ? 'приготовься' : notation.currentBpm + ' BPM')),
        h('div', null, h('strong', null, previewTitle), h('span', null, notation.previewIsNextBlock ? 'смена блока' : 'read-ahead'))
      ),
      h(
        'div',
        { className: 'drums-ft-notation__scroll' },
        h(
          'svg',
          {
            ref: svgRef,
            className: 'drums-ft-notation__svg',
            viewBox: '0 0 ' + width + ' 196',
            role: 'img',
            'aria-label': 'Ритм-нотация текущих и следующих двух тактов',
          },
          renderStaff(ACTIVE_Y, notation.active, 'active'),
          h('line', { className: 'drums-ft-notation__divider', x1: 16, x2: width - 16, y1: 101, y2: 101 }),
          renderStaff(PREVIEW_Y, notation.preview, 'preview')
        )
      )
    );
  }

  Object.assign(DFC, {
    NotationPanel,
  });
})(typeof window !== 'undefined' ? window : globalThis);
