// MediaSlot.tsx — слот материала съёмки с честной заглушкой.
//
// Фаза 1 (`маркетинг/47`): каркас не ждёт съёмку — слот либо показывает
// временное изображение с явной пометкой, либо пустую рамку с описанием
// кадра. Оба состояния заменяются материалами в фазе 3. Формулировки
// кадров — из съёмочного листа `47`.

interface MediaSlotProps {
  /** Какой кадр здесь появится. */
  frame: string;
  /** Формат материала, например «видео 3–5 сек» или «портрет». */
  format: string;
  ratio?: 'video' | 'portrait' | 'square';
  /** Временное изображение до съёмки; без него остаётся пустая рамка. */
  src?: string;
  alt?: string;
}

const RATIO_CLASS: Record<NonNullable<MediaSlotProps['ratio']>, string> = {
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  square: 'aspect-square',
};

export default function MediaSlot({ frame, format, ratio = 'video', src, alt }: MediaSlotProps) {
  if (src) {
    return (
      <figure className={`relative ${RATIO_CLASS[ratio]} w-full overflow-hidden rounded-2xl`}>
        {/* Статический экспорт: обычный img, оптимизация next/image недоступна. */}
        <img src={src} alt={alt ?? frame} className="h-full w-full object-cover" loading="lazy" />
        <figcaption className="absolute bottom-2 left-2 rounded-full bg-slate-900/60 px-2.5 py-1 text-[10px] font-medium text-white">
          Временное фото · заменит съёмка
        </figcaption>
      </figure>
    );
  }

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
