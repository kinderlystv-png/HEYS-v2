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

  const optionClass =
    'w-full rounded-[14px] border border-[rgba(16,24,38,0.14)] bg-[#FBFAF7] px-5 py-4 text-left text-[15px] leading-[1.4] text-[#101826] transition-colors duration-200 hover:border-[color:var(--da)] hover:bg-white';
  const inputClass =
    'w-full rounded-[13px] border border-[rgba(16,24,38,0.16)] bg-[#FBFAF7] px-4 py-3 text-[15px] text-[#101826] outline-none transition-colors placeholder:text-[#9AA3B0] focus:border-[color:var(--da)]';
  const labelClass = 'mb-2 block text-[13px] font-semibold text-[#5B6472]';
  const errorClass = 'mt-1.5 text-[12px] text-[#B3384A]';

  const chipRow = <T extends string>(
    title: string,
    choices: ReadonlyArray<Choice<T>>,
    value: string | null,
    onPick: (code: T) => void,
  ) => (
    <div>
      <p className="text-[13px] font-semibold text-[#5B6472]">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.code}
            type="button"
            onClick={() => onPick(choice.code)}
            className={`rounded-full border px-4 py-2 text-[13.5px] transition-colors ${
              value === choice.code
                ? 'border-[color:var(--da)] bg-[color:var(--da)] text-white'
                : 'border-[rgba(16,24,38,0.16)] bg-white text-[#5B6472] hover:border-[color:var(--da)]'
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

      {step === 'trigger' ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
            Шаг 1 из 2
          </p>
          <h3 className="mt-4 text-[clamp(17px,1.9vw,20px)] font-semibold leading-[1.35] text-[#101826]">
            Что чаще всего запускает срыв?
          </h3>
          <div className="mt-6 space-y-3">
            {TRIGGER_CHOICES.map((choice) => (
              <button
                key={choice.code}
                type="button"
                onClick={() => chooseTrigger(choice.code)}
                className={optionClass}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'when' ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
            Шаг 2 из 2
          </p>
          <h3 className="mt-4 text-[clamp(17px,1.9vw,20px)] font-semibold leading-[1.35] text-[#101826]">
            Когда чаще всего сложнее удержать режим?
          </h3>
          <div className="mt-6 space-y-3">
            {WHEN_CHOICES.map((choice) => (
              <button
                key={choice.code}
                type="button"
                onClick={() => chooseWhen(choice.code)}
                className={optionClass}
              >
                {choice.label}
              </button>
            ))}
          </div>
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
              куратору контекст до первого сообщения (`17` § 3.7). */}
          <div className="mt-8 space-y-6">
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
          <p className="mt-3 text-center text-[12px] text-[#9AA3B0]">
            Ответы уйдут куратору вместе с заявкой — по отдельности мы их никуда не отправляем.
          </p>
        </div>
      ) : null}

      {step === 'form' ? (
        <form ref={formRef} onSubmit={handleSubmit} aria-label="Заявка на неделю Pro" noValidate>
          <h3 className="text-[clamp(17px,1.9vw,20px)] font-semibold leading-[1.35] text-[#101826]">
            Куда куратору написать?
          </h3>

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

          <div className="mt-6 space-y-4">
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
              <div className="flex items-center rounded-[13px] border border-[rgba(16,24,38,0.16)] bg-[#FBFAF7] px-4 py-3 focus-within:border-[color:var(--da)]">
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
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-[#101826] outline-none placeholder:text-[#9AA3B0]"
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
                    className={`rounded-[14px] border px-3 py-3 text-[14px] font-medium transition-colors ${
                      messenger === item.code
                        ? 'border-[#12283E] bg-[#12283E] text-white'
                        : 'border-[rgba(16,24,38,0.16)] bg-white text-[#5B6472] hover:border-[rgba(16,24,38,0.3)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="d-birth-year" className={labelClass}>
                Год рождения
              </label>
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
                className={inputClass}
              />
              {fieldErrors.birthYear ? (
                <p className={errorClass} role="alert">
                  {fieldErrors.birthYear}
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-[#9AA3B0]">
                  Сервис доступен только лицам старше 18 лет.
                </p>
              )}
            </div>
          </div>

          <label className="mt-6 flex cursor-pointer select-none items-start gap-3">
            <input
              id="d-consent"
              type="checkbox"
              checked={consentAccepted}
              disabled={loading}
              onChange={(event) => {
                setConsentAccepted(event.target.checked);
                setFieldErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#12283E]"
            />
            <span className="text-[12px] leading-[1.6] text-[#5B6472]">
              Даю согласие на обработку персональных данных в соответствии с{' '}
              <a
                href="/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--da)] underline underline-offset-2"
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

          <details className="mt-4 rounded-[13px] border border-[rgba(16,24,38,0.12)] bg-[#FBFAF7] px-4 py-3">
            <summary className="cursor-pointer text-[12px] font-medium text-[#5B6472]">
              Необязательно: полезные материалы и акции
            </summary>
            <label className="mt-3 flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                checked={marketingAccepted}
                disabled={loading}
                onChange={(event) => setMarketingAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#12283E]"
              />
              <span className="text-[12px] leading-[1.6] text-[#5B6472]">
                Хочу получать полезные материалы и новости по выбранным контактам. На заявку это не
                влияет, отказаться можно в любой момент.{' '}
                <a
                  href="/legal/marketing-consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--da)] underline underline-offset-2"
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
            className="mt-6 w-full rounded-[14px] bg-[#12283E] px-6 py-4 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? 'Отправляем…' : 'Оставить заявку на неделю Pro (0 ₽)'}
          </button>
          <p className="mt-3 text-center text-[12px] leading-[1.5] text-[#9AA3B0]">
            Заявка не гарантирует начало пробной недели — куратор подтвердит свободное место.
          </p>
        </form>
      ) : null}
    </div>
  );
}
