'use client';

// TrialQuiz — короткий разбор перед заявкой и сама заявка.
//
// Версионно-независим: цвета берутся из CSS-переменной `--da`, которую задаёт
// обёртка версии, остальное — нейтральные тона. При выборе другой версии
// компонент переезжает без переделки (решение владельца `15` №50).
//
// Состояния: intro → trigger → (when) → result → form → sent. Второй путь с
// первого шага — «просто оставить контакт»: человек, который уже решил, не
// должен проходить разбор ради формы.
//
// 152-ФЗ. Ответы квиза вместе с контактом попадают в чувствительную категорию,
// поэтому они живут только в памяти вкладки: ни localStorage, ни поштучной
// отправки. Всё уходит одним пакетом вместе с заявкой и согласием.

import { Playfair_Display } from 'next/font/google';
import { useMemo, useRef, useState } from 'react';

import {
  BARRIER_CHOICES,
  describeAnswers,
  EMPTY_ANSWERS,
  FREQUENCY_CHOICES,
  GOAL_CHOICES,
  resolveSegment,
  SEGMENTS,
  TRIGGER_CHOICES,
  WHEN_CHOICES,
  type Choice,
  type QuizAnswers,
  type TriggerCode,
  type WhenCode,
} from './quizModel';

import { LEGAL_DOCS, SUPPORT_CONTACTS } from '@/config/legal-versions';
import { funnelTrail, track } from '@/lib/funnel';
import { readUtmParams, readYandexClientId, submitLead, type Messenger } from '@/lib/leads';

// Антиква курсивом для заголовка разбора — единственного места страницы, где
// текст персонально про этого человека. Шрифт объявлен здесь, а не взят из
// `versions/d/fonts.ts`: квиз намеренно версионно-независим (см. шапку файла), и
// импорт из папки версии D привязал бы его к ней. `next/font` дедуплицирует
// одинаковые начертания, так что второй объявленный экземпляр не тянет за собой
// второй файл шрифта.
const playfairQuiz = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: ['500'],
  style: ['italic'],
  display: 'swap',
});

type Step = 'intro' | 'trigger' | 'when' | 'result' | 'form' | 'sent';
type FieldName = 'name' | 'phone' | 'birthYear' | 'consent';
type FieldErrors = Partial<Record<FieldName, string>>;

const MESSENGERS: ReadonlyArray<{ code: Messenger; label: string }> = [
  { code: 'telegram', label: 'Telegram' },
  { code: 'whatsapp', label: 'WhatsApp' },
  { code: 'max', label: 'MAX' },
];

interface TrialQuizProps {
  /** Версия страницы — уходит в заявку как `ab_variant`. */
  abVariant: string;
}

export default function TrialQuiz({ abVariant }: TrialQuizProps) {
  const [step, setStep] = useState<Step>('intro');
  const [answers, setAnswers] = useState<QuizAnswers>(EMPTY_ANSWERS);
  const [quizTaken, setQuizTaken] = useState(false);

  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [messenger, setMessenger] = useState<Messenger>('telegram');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [website, setWebsite] = useState('');

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const segment = useMemo(
    () => (answers.trigger ? resolveSegment(answers.trigger, answers.when) : null),
    [answers.trigger, answers.when],
  );
  const summary = useMemo(() => describeAnswers(answers), [answers]);

  const formatPhone = (digits: string) => {
    if (digits.length === 0) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 8)
      return `${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  };

  const chooseTrigger = (code: TriggerCode) => {
    setAnswers((prev) => ({ ...prev, trigger: code, when: null }));
    // Уточняющий вопрос про время суток нужен только тем, кто сам не понимает
    // причину: остальным он ничего не добавляет к типу срыва (`17` § 3.2).
    const next = code === 'unknown' ? 'when' : 'result';
    setStep(next);
    // Разбор считается пройденным в тот момент, когда сегмент определён, —
    // для большинства это первый же ответ.
    if (next === 'result') track('quiz_complete', { segment: resolveSegment(code, null) });
  };

  const chooseWhen = (code: WhenCode) => {
    setAnswers((prev) => ({ ...prev, when: code }));
    setStep('result');
    if (answers.trigger) {
      track('quiz_complete', { segment: resolveSegment(answers.trigger, code) });
    }
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'Укажите, как к вам обращаться.';
    if (phoneDigits.length !== 10) errors.phone = 'Введите 10 цифр после +7.';

    const currentYear = new Date().getFullYear();
    const year = Number.parseInt(birthYear, 10);
    if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
      errors.birthYear = 'Укажите год рождения четырьмя цифрами.';
    } else if (currentYear - year < 18) {
      errors.birthYear = 'Сервис доступен только лицам старше 18 лет.';
    }

    if (!consentAccepted) errors.consent = 'Подтвердите согласие на обработку данных заявки.';

    setFieldErrors(errors);
    const first = (Object.keys(errors) as FieldName[])[0];
    if (!first) return true;

    const ids: Record<FieldName, string> = {
      name: 'd-name',
      phone: 'd-phone',
      birthYear: 'd-birth-year',
      consent: 'd-consent',
    };
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`#${ids[first]}`)?.focus();
    });
    return false;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setLoading(true);
    // Событие ставится до отправки: след воронки уезжает внутри самой заявки,
    // и `week_request` должен успеть попасть в этот пакет.
    track('week_request', { quiz: quizTaken });
    try {
      const ymClientId = await readYandexClientId(consentAccepted);
      await submitLead({
        name,
        phoneDigits,
        messenger,
        birthYear: Number.parseInt(birthYear, 10),
        website,
        marketingAccepted,
        utm: readUtmParams(),
        ymClientId,
        abVariant,
        quizSegment: segment ?? undefined,
        quizDetails: quizTaken
          ? {
              frequency: answers.frequency,
              barrier: answers.barrier,
              goal: answers.goal,
            }
          : undefined,
        funnel: funnelTrail(),
      });
      setStep('sent');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Произошла ошибка. Попробуйте ещё раз или напишите нам напрямую.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Поле 48px вместо прежних ~56: форма из шести блоков одного веса читалась
  // анкетой, и рост каждого блока умножался на шесть. Плейсхолдер `#98A2AE`
  // светлее текста, но темнее прежнего `#9AA3B0` — пустое поле не должно
  // выглядеть заполненным почти невидимым серым (пакет формы, § Контраст).
  // Ширина вынесена из базового класса: поле года узкое, и `w-full` из общей
  // строки перебивал `w-[132px]` — оба задают `width`, и порядок решает не
  // разметка, а генерация CSS.
  const inputBase =
    'rounded-[12px] border border-[rgba(16,24,38,0.14)] bg-[#FBFAF7] px-[14px] py-[13px] text-[15px] text-[#101826] outline-none transition-colors placeholder:text-[#98A2AE] focus:border-[color:var(--da)]';
  const inputClass = `w-full ${inputBase}`;
  const labelClass = 'mb-1.5 block text-[12.5px] font-semibold text-[#5B6472]';
  const errorClass = 'mt-1.5 text-[12px] text-[#B3384A]';

  const chipRow = <T extends string>(
    title: string,
    choices: ReadonlyArray<Choice<T>>,
    value: string | null,
    onPick: (code: T) => void,
  ) => (
    // Линия сверху разделяет группы: подряд без границ три вопроса читались
    // одним полотном, и человек не видел, что их именно три.
    <div className="mt-5 border-t border-[rgba(16,24,38,0.08)] pt-4">
      <p className="text-[12.5px] font-semibold text-[#101826]">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.code}
            type="button"
            onClick={() => onPick(choice.code)}
            // `leading-[1.2]` задан явно: спека его не оговаривала, и чип
            // наследовал 1.5 от родителя — высота выходила 40px вместо 36 при
            // тех же паддингах 9/14. Заметно на третьей группе, где чипы идут
            // в три ряда (замечание ревьюера 2026-08-09: «чипы крупнее
            // макетных» — паддинги были верные, рос интерлиньяж).
            //
            // Выбранный чип тёмный, а не акцентный: синий на заливке спорит с
            // кнопками действия и читается как «нажми сюда», а не «выбрано».
            className={`rounded-full border px-[14px] py-[9px] text-[13.5px] leading-[1.2] transition-colors ${
              value === choice.code
                ? 'border-[#12283E] bg-[#12283E] font-semibold text-white'
                : 'border-[rgba(16,24,38,0.16)] bg-white text-[#3C4552] hover:border-[rgba(16,24,38,0.3)]'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (step === 'sent') {
    return (
      <div className="rounded-[22px] border border-[rgba(16,24,38,0.1)] bg-white px-[22px] py-7 min-[561px]:rounded-3xl min-[561px]:p-10">
        <h3 className="text-[clamp(18px,2vw,22px)] font-semibold text-[#101826]">
          Заявка получена
        </h3>
        <p className="mt-4 text-[15px] leading-[1.6] text-[#5B6472]">
          {quizTaken
            ? 'Куратор посмотрит ваш разбор до первого сообщения — начинать с нуля не придётся. Свяжется с вами через выбранный канал.'
            : 'Куратор свяжется с вами через выбранный канал и уточнит, подходит ли формат.'}
        </p>
        <p className="mt-6 text-[12px] leading-[1.6] text-[#9AA3B0]">
          Заявка не гарантирует начало пробной недели — куратор подтвердит свободное место. Если
          сообщение не пришло, проверьте папку «Запросы» или напишите нам:{' '}
          {SUPPORT_CONTACTS.telegramHandle}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-[rgba(16,24,38,0.1)] bg-white px-[22px] py-7 min-[561px]:rounded-3xl min-[561px]:p-8 sm:p-10">
      {step === 'intro' ? (
        <div>
          <h3 className="text-[clamp(17px,1.9vw,20px)] font-semibold leading-[1.35] text-[#101826]">
            Хотите, куратор начнёт не с нуля?
          </h3>
          <p className="mt-4 text-[15px] leading-[1.6] text-[#5B6472]">
            Один вопрос — и вы увидите, какой сценарий чаще всего сбивает режим именно у вас. Это не
            тест на силу воли и занимает меньше минуты.
          </p>
          {/* Иерархию несёт ширина: основная кнопка растёт (`flex:1 1 220px`
              в макете), выход остаётся по контенту (`flex:0 1 auto`). Ровно
              это и делает выход запасным — равные по размеру кнопки читаются
              как равные по весу варианты.
              
              `items-start` здесь не подходит, хотя тоже даёт ширину по
              контенту: он сжимает обе, и разница между ними падает до 15px —
              на глаз это одинаковые кнопки. Растягивать нужно именно
              основную. */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setQuizTaken(true);
                track('quiz_start');
                setStep('trigger');
              }}
              className="w-full sm:flex-1 rounded-[14px] bg-[#12283E] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
            >
              Пройти короткий разбор →
            </button>
            <button
              type="button"
              onClick={() => setStep('form')}
              className="self-start sm:flex-none rounded-[14px] border border-[rgba(16,24,38,0.22)] px-6 py-3.5 text-[15px] font-semibold text-[#101826] transition-colors hover:border-[rgba(16,24,38,0.32)]"
            >
              Просто заполнить форму
            </button>
          </div>
        </div>
      ) : null}

      {step === 'trigger' || step === 'when' ? (
        <div>
          {/* Шапка экрана: текст отвечает «где я», полоска — «сколько
              осталось». Второе считывается быстрее, поэтому есть оба. */}
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5F6A77]">
              Шаг {step === 'trigger' ? 1 : 2} из 2
            </p>
            {/* Тот же выход, что кнопка «Просто заполнить форму» на интро:
                человек не должен застревать в разборе, если передумал. */}
            <button
              type="button"
              onClick={() => setStep('form')}
              className="shrink-0 text-[13px] text-[#5F6A77] underline decoration-[0.5px] underline-offset-[3px] transition-colors hover:text-[#101826]"
            >
              пропустить
            </button>
          </div>

          <div className="mt-3 flex gap-[5px]" aria-hidden="true">
            <span className="h-[3px] flex-1 rounded-[2px] bg-[#12283E]" />
            <span
              className={`h-[3px] flex-1 rounded-[2px] ${
                step === 'when' ? 'bg-[#12283E]' : 'bg-[rgba(16,24,38,0.12)]'
              }`}
            />
          </div>

          <h3
            className={`${playfairQuiz.className} mt-4 text-[clamp(19px,2.3vw,23px)] font-medium italic leading-[1.25] text-[#101826]`}
          >
            {step === 'trigger'
              ? 'Что чаще всего запускает срыв?'
              : 'Когда чаще всего сложнее удержать режим?'}
          </h3>

          {/* Карточка ответа: заголовок плюс описание опыта. Голый ярлык
              заставляет подобрать, куда себя отнести, — вторая строка даёт
              узнать себя. На шаге `when` описаний нет: время суток однозначно
              и пояснять там нечего. */}
          <div className="mt-5 flex flex-col gap-[9px]">
            {(step === 'trigger' ? TRIGGER_CHOICES : WHEN_CHOICES).map((choice) => {
              const dashed = choice.code === 'unknown';
              return (
                <button
                  key={choice.code}
                  type="button"
                  onClick={() =>
                    step === 'trigger'
                      ? chooseTrigger(choice.code as TriggerCode)
                      : chooseWhen(choice.code as WhenCode)
                  }
                  className={`rounded-[14px] border bg-white px-[14px] py-3 text-left transition-colors duration-200 hover:border-[color:var(--da)] ${
                    dashed
                      ? 'border-dashed border-[rgba(16,24,38,0.2)]'
                      : 'border-[rgba(16,24,38,0.14)]'
                  }`}
                >
                  <span
                    className={`block text-[15px] font-semibold leading-[1.35] ${
                      dashed ? 'text-[#5B6472]' : 'text-[#101826]'
                    }`}
                  >
                    {choice.label}
                  </span>
                  {choice.hint ? (
                    <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-[#5F6A77]">
                      {choice.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Вопрос «что запускает срыв» звучит обвинением, пока не сказано
              обратное. Описания снимают это частично, прямая фраза надёжнее.
              На шаге `when` не повторяется — там вопрос нейтральный. */}
          {step === 'trigger' ? (
            <p className="mt-4 text-[12.5px] leading-[1.5] text-[#5F6A77]">
              Это не тест на силу воли: срывы чаще связаны с усталостью, контекстом и привычными
              сценариями дня.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'result' && segment ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--da)]">
            Ваш сценарий
          </p>
          <h3
            className={`${playfairQuiz.className} mt-3 text-[clamp(26px,3.2vw,34px)] font-medium italic leading-[1.2] text-[#101826]`}
          >
            {SEGMENTS[segment].title}
          </h3>
          <p className="mt-4 text-[15px] leading-[1.65] text-[#5B6472]">
            {SEGMENTS[segment].explanation}
          </p>

          <div className="mt-6 rounded-[18px] bg-[#FBFAF7] px-6 py-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
              Первый шаг
            </p>
            <p className="mt-2 text-[15px] leading-[1.6] text-[#101826]">
              {SEGMENTS[segment].firstStep}
            </p>
          </div>

          <div className="mt-4 rounded-[18px] bg-[#12283E] px-6 py-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8FC1E8]">
              Что делает куратор
            </p>
            <p className="mt-2 text-[15px] leading-[1.6] text-white">{SEGMENTS[segment].curator}</p>
          </div>

          {/* Три уточнения необязательны: они не меняют тип срыва, но дают
              куратору контекст до первого сообщения (`17` § 3.7).

              «Зачем это спрашивают» стоит НАД группами, а не под кнопкой: под
              кнопкой человек читает объяснение уже после того, как решил
              отвечать или нет. */}
          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5F6A77]">
              Необязательно · три вопроса
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-[#5B6472]">
              Ответы уйдут куратору вместе с заявкой — чтобы он начал не с общих слов.
            </p>
            {chipRow('Как часто это повторяется?', FREQUENCY_CHOICES, answers.frequency, (code) =>
              setAnswers((prev) => ({ ...prev, frequency: code })),
            )}
            {chipRow('Что сложнее всего сейчас?', BARRIER_CHOICES, answers.barrier, (code) =>
              setAnswers((prev) => ({ ...prev, barrier: code })),
            )}
            {chipRow('Что важнее на ближайший месяц?', GOAL_CHOICES, answers.goal, (code) =>
              setAnswers((prev) => ({ ...prev, goal: code })),
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep('form')}
            className="mt-8 w-full rounded-[14px] bg-[#12283E] px-6 py-4 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
          >
            Оставить заявку на неделю Pro →
          </button>
        </div>
      ) : null}

      {step === 'form' ? (
        <form ref={formRef} onSubmit={handleSubmit} aria-label="Заявка на неделю Pro" noValidate>
          {/* Заголовок адаптивный, хотя спека задаёт 22px фиксированно:
              правило масштаба версии D старше пакета, а заголовок секции
              заявки на узких экранах падает до 28px — фиксированные 22 дали бы
              0.79 от него. Максимум совпадает со спекой.

              Индикатор отвечает на «сколько ещё осталось» — раньше на это не
              отвечало ничто, и форма выглядела бесконечной. Заголовок Playfair
              italic — тот же приём, что в подзаголовках тарифных карточек:
              последний экран должен звучать человеком, а не бланком. */}
          <p className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-[22px] w-[22px] shrink-0 rounded-full bg-[#E9EFF6]"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5F6A77]">
              Остался последний шаг
            </span>
          </p>
          <h3
            className={`${playfairQuiz.className} mt-3 text-[clamp(19px,2.2vw,22px)] font-medium italic leading-[1.3] text-[#101826]`}
          >
            Куда куратору написать?
          </h3>
          {/* Называет объём работы: человек видит конец, а не открытый список. */}
          <p className="mt-2 text-[13.5px] leading-[1.5] text-[#5B6472]">
            Четыре поля. Дальше куратор пишет сам.
          </p>

          {quizTaken && summary.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] bg-[#FBFAF7] px-5 py-4 text-[13.5px] leading-[1.5] text-[#5B6472]">
              <span className="font-semibold text-[#101826]">Куратор увидит:</span>
              <span>{summary.join(' · ')}</span>
              <button
                type="button"
                onClick={() => setStep('result')}
                className="text-[color:var(--da)] underline underline-offset-2 transition-colors hover:text-[color:var(--da-hover)]"
              >
                изменить
              </button>
            </div>
          ) : null}

          <div className="mt-6 space-y-3.5">
            <div>
              <label htmlFor="d-name" className={labelClass}>
                Ваше имя
              </label>
              <input
                id="d-name"
                type="text"
                value={name}
                autoComplete="name"
                placeholder="Как к вам обращаться?"
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.name)}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={inputClass}
              />
              {fieldErrors.name ? (
                <p className={errorClass} role="alert">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="d-phone" className={labelClass}>
                Номер телефона
              </label>
              <div className="flex items-center rounded-[12px] border border-[rgba(16,24,38,0.14)] bg-[#FBFAF7] px-[14px] py-[13px] focus-within:border-[color:var(--da)]">
                <span className="select-none whitespace-nowrap text-[15px] text-[#101826]">
                  +7&nbsp;(
                </span>
                <input
                  id="d-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="___) ___-__-__"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  value={formatPhone(phoneDigits)}
                  onChange={(event) => {
                    setPhoneDigits(event.target.value.replace(/\D/g, '').slice(0, 10));
                    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-[#101826] outline-none placeholder:text-[#98A2AE]"
                />
              </div>
              {fieldErrors.phone ? (
                <p className={errorClass} role="alert">
                  {fieldErrors.phone}
                </p>
              ) : null}
            </div>

            {/* Honeypot: человек его не видит, бот заполняет. */}
            <div hidden aria-hidden="true">
              <label htmlFor="d-website">Website (do not fill)</label>
              <input
                id="d-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            <div>
              <span className={labelClass}>Где удобнее общаться?</span>
              <div className="grid grid-cols-3 gap-2">
                {MESSENGERS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    disabled={loading}
                    onClick={() => setMessenger(item.code)}
                    className={`rounded-[11px] border px-1.5 py-2.5 text-[13.5px] transition-colors ${
                      messenger === item.code
                        ? 'border-[#12283E] bg-[#12283E] font-semibold text-white'
                        : 'border-[rgba(16,24,38,0.16)] bg-white font-medium text-[#3C4552] hover:border-[rgba(16,24,38,0.3)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 148px, а не 132 из спеки: плейсхолдер «Например, 1990» в 132px
                обрезался до «Например, 19…». Укоротить его нельзя — по той же
                спеке пустое поле обязано отличаться от заполненного текстом, а
                не только цветом, иначе читается как уже заполненное.

                Поле под четырёхзначное число во всю ширину читалось как ещё
                один крупный блок анкеты, а возрастное ограничение занимало
                отдельную строку под ним. Узкое поле и пояснение рядом по
                нижнему краю снимают обе проблемы одной перестановкой. */}
            <div>
              <label htmlFor="d-birth-year" className={labelClass}>
                Год рождения
              </label>
              <div className="flex items-end gap-3">
                <input
                  id="d-birth-year"
                  type="text"
                  inputMode="numeric"
                  autoComplete="bday-year"
                  placeholder="Например, 1990"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.birthYear)}
                  value={birthYear}
                  onChange={(event) => {
                    setBirthYear(event.target.value.replace(/\D/g, '').slice(0, 4));
                    setFieldErrors((prev) => ({ ...prev, birthYear: undefined }));
                  }}
                  className={`${inputBase} w-[148px] shrink-0`}
                />
                {/* `text-balance`, а не выравнивание: `items-end` уже стоит и
                    работает — низ пояснения совпадает с низом поля (замер: 510
                    и 510). Проблема в ширине — на пояснение остаётся 144px, и
                    перенос по умолчанию рвал фразу посередине, «с 18 / лет».
                    Balance распределяет строки ровно и переносит после
                    «доступен». */}
                <p className="text-balance pb-2.5 text-[12px] leading-[1.4] text-[#5F6A77]">
                  Сервис доступен с 18 лет
                </p>
              </div>
              {fieldErrors.birthYear ? (
                <p className={errorClass} role="alert">
                  {fieldErrors.birthYear}
                </p>
              ) : null}
            </div>
          </div>

          <label className="mt-6 flex cursor-pointer select-none items-start gap-[9px]">
            <input
              id="d-consent"
              type="checkbox"
              checked={consentAccepted}
              disabled={loading}
              onChange={(event) => {
                setConsentAccepted(event.target.checked);
                setFieldErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] accent-[#12283E]"
            />
            <span className="text-[12px] leading-[1.6] text-[#5F6A77]">
              Даю согласие на обработку персональных данных в соответствии с{' '}
              <a
                href="/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2467A3] underline decoration-[0.5px] underline-offset-2"
                onClick={(event) => event.stopPropagation()}
              >
                политикой конфиденциальности
              </a>{' '}
              (версия {LEGAL_DOCS.privacyPolicy.version}). Согласие относится только к заявке и
              обратной связи по ней.
            </span>
          </label>
          {fieldErrors.consent ? (
            <p className={`${errorClass} pl-7`} role="alert">
              {fieldErrors.consent}
            </p>
          ) : null}

          {/* Без рамки и подложки: блок необязательный, и оформленный
              карточкой он весил столько же, сколько обязательные поля. */}
          <details className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-[#5B6472] [&::-webkit-details-marker]:hidden">
              Необязательно: полезные материалы и акции
              <span
                aria-hidden="true"
                className="text-[#5F6A77] transition-transform duration-200 group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <label className="mt-3 flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                checked={marketingAccepted}
                disabled={loading}
                onChange={(event) => setMarketingAccepted(event.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] accent-[#12283E]"
              />
              <span className="text-[12px] leading-[1.6] text-[#5F6A77]">
                Хочу получать полезные материалы и новости по выбранным контактам. На заявку это не
                влияет, отказаться можно в любой момент.{' '}
                <a
                  href="/legal/marketing-consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2467A3] underline decoration-[0.5px] underline-offset-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  Полные условия
                </a>
              </span>
            </label>
          </details>

          {submitError ? (
            <p className="mt-4 rounded-[13px] border border-[#E7C3C9] bg-[#FCF4F5] px-4 py-3 text-[13.5px] text-[#B3384A]">
              {submitError}
            </p>
          ) : null}

          <button
            data-own-cta
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-[14px] bg-[#12283E] whitespace-nowrap px-5 py-4 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? 'Отправляем…' : 'Оставить заявку — 0 ₽'}
          </button>
          {/* Спека предлагала оставить здесь только «Куратор подтвердит
              свободное место», но снятие обещания убирать нельзя: тест
              `versionD-positioning` держит эту строку под кнопкой, и держит
              по делу — «не гарантирует» защищает от обещания результата.
              Оформление взято из спеки, формулировка сохранена. */}
          <p className="mt-3 text-center text-[12px] leading-[1.5] text-[#5F6A77]">
            Заявка не гарантирует начало пробной недели — куратор подтвердит свободное место.
          </p>
        </form>
      ) : null}
    </div>
  );
}
