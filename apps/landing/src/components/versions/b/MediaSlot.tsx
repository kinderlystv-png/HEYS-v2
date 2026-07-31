// MediaSlot.tsx — честная заглушка на месте будущего материала съёмки.
//
// Фаза 1 (`маркетинг/47`): каркас не ждёт съёмку — заглушка явно показывает,
// какой кадр здесь появится, и заменяется материалом в фазе 3. Формулировки
// кадров — из съёмочного листа `47`.

interface MediaSlotProps {
  /** Какой кадр здесь появится. */
  frame: string;
  /** Формат материала, например «видео 3–5 сек» или «портрет». */
  format: string;
  ratio?: 'video' | 'portrait' | 'square';
}

const RATIO_CLASS: Record<NonNullable<MediaSlotProps['ratio']>, string> = {
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  square: 'aspect-square',
};

export default function MediaSlot({ frame, format, ratio = 'video' }: MediaSlotProps) {
  return (
    <figure
      className={`flex ${RATIO_CLASS[ratio]} w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center`}
    >
      <figcaption className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Съёмка запланирована · {format}
      </figcaption>
      <p className="text-[13px] leading-5 text-slate-500">{frame}</p>
    </figure>
  );
}
