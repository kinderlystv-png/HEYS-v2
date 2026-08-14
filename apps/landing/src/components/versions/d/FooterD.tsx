// Футер версии D.
//
// Собственная вёрстка, но состав обязательных элементов тот же, что в общем
// `FooterSSR`: правовые ссылки, медицинский дисклеймер, реквизиты оператора и
// запись в реестре РКН. Реквизиты берутся из `OPERATOR`, контакты — из
// `SUPPORT_CONTACTS`: хардкод здесь разошёлся бы с legal-страницами при первом
// же обновлении.
//
// Пересобран 2026-08-09 по дизайн-ревью подвала. Было: восемь ссылок одной
// очередью (документы вперемешку с калькуляторами), два контакта без подписей,
// центрированный дисклеймер и вордмарк до 200px высотой. Стало: контакты с
// назначением на подложке, документы сеткой, калькуляторы отдельным входом,
// дисклеймер по левому краю с выделенной медицинской оговоркой, вордмарк —
// подписью рядом с копирайтом.
//
// Пороги контраста на тёмном фоне, заданные ревью: белый текст мельче 13px —
// не прозрачнее 0.5, uppercase-эйбровы 10.5px — не прозрачнее 0.55.

import { LogoD } from './LogoD';

import { OPERATOR, SUPPORT_CONTACTS } from '@/config/legal-versions';

// Только правовые документы. «Калькуляторы» стояли здесь же восьмым пунктом и
// терялись: это живая публичная страница, а не документ, и в одном перечне с
// политикой конфиденциальности её никто не искал. Вынесены отдельным входом
// ниже — футер остался их единственной точкой входа с лендинга.
//
// «Все документы» тоже ушли из списка: ссылка на индекс не равна документу и
// восьмым пунктом того же веса читалась как ещё один файл. За ней есть что
// открывать — `speech-transcription-consent` и `privacy` в этот перечень не
// входят.
const LEGAL_LINKS = [
  { href: '/legal/user-agreement', label: 'Пользовательское соглашение' },
  { href: '/legal/privacy-policy', label: 'Политика конфиденциальности' },
  { href: '/legal/personal-data-consent', label: 'Персональные данные' },
  { href: '/legal/refund', label: 'Возврат' },
  { href: '/legal/marketing-consent', label: 'Маркетинговые материалы' },
  { href: '/legal/cookie-policy', label: 'Cookies' },
];

/** Подпись-эйбров над блоком. Порог контраста на тёмном фоне — не ниже 0.55. */
function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/60">
      {children}
    </p>
  );
}

export default function FooterD() {
  return (
    <footer
      data-theme-bar="#0A1119"
      className="overflow-hidden bg-[#0A1119] px-5 pb-12 pt-16 sm:px-8"
    >
      <div className="mx-auto w-full max-w-[1060px]">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between sm:gap-14">
          <div className="sm:max-w-[400px] sm:flex-1">
            <LogoD size={20} />

            {/* Раньше два адреса стояли подряд без подписей, и выбирать канал
                приходилось наугад. Теперь у каждого сказано назначение.
                Почта закрывает и обращения по персональным данным: в
                `legal-versions.ts` `privacyEmail` — тот же адрес, а страница
                прямо обещает право отозвать согласие в любой момент, поэтому
                человек должен видеть, куда с этим идти. */}
            <div className="mt-6 rounded-2xl bg-white/[0.05] px-4 pb-3.5 pt-4">
              <Eyebrow>Написать нам</Eyebrow>
              <a
                href={SUPPORT_CONTACTS.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-[15px] font-semibold text-[#9DC7EE] transition-colors hover:text-[#BBD9F5]"
              >
                {SUPPORT_CONTACTS.telegramHandle}
              </a>
              <p className="mt-0.5 text-[12.5px] leading-[1.45] text-white/55">
                Telegram — сюда пишут по неделе и вопросам сопровождения
              </p>

              <div className="mt-3 border-t border-white/10 pt-3">
                <a
                  href={`mailto:${SUPPORT_CONTACTS.generalEmail}`}
                  className="text-[15px] font-semibold text-white/90 transition-colors hover:text-white"
                >
                  {SUPPORT_CONTACTS.generalEmail}
                </a>
                <p className="mt-0.5 text-[12.5px] leading-[1.45] text-white/55">
                  Почта — документы, оплата, возврат и обращения по персональным данным
                </p>
              </div>
            </div>

            {/* Калькуляторы — продуктовая страница, а не документ. В общем
                перечне они стояли между соглашением и политикой и терялись;
                футер остался их единственным входом с лендинга. */}
            <div className="mt-3.5 rounded-2xl bg-white/[0.05] px-4 py-3.5">
              <a
                href="/calculators"
                className="text-[14.5px] font-semibold text-white/90 transition-colors hover:text-white"
              >
                Калькуляторы
              </a>
              <p className="mt-0.5 text-[12.5px] leading-[1.45] text-white/55">
                Норма калорий, вода, ИМТ — без регистрации
              </p>
            </div>
          </div>

          <div className="sm:pt-1">
            <Eyebrow>Документы</Eyebrow>
            {/* Сетка вместо очереди: шесть строк одного веса читались списком
                задач и тянули футер вниз. В две колонки они видны разом. */}
            <nav className="mt-3 grid grid-cols-2 gap-x-4 gap-y-[11px] sm:gap-x-8">
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-[13.5px] leading-[1.35] text-white/75 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <a
              href="/legal/agreements"
              className="mt-3.5 inline-block border-b border-[#9DC7EE]/40 text-[13.5px] font-semibold text-[#9DC7EE] transition-colors hover:border-[#9DC7EE] hover:text-[#BBD9F5]"
            >
              Все документы →
            </a>
          </div>
        </div>

        {/* По левому краю, а не по центру: центрированный текст в четыре строки
            читается рывками. Медицинская оговорка светлее остального — это та
            часть, ради которой абзац существует. */}
        <p className="mt-10 max-w-[640px] text-[12.5px] leading-[1.6] text-white/55">
          HEYS — сервис сопровождения по режиму питания, привычкам и образу жизни.{' '}
          <span className="text-white/80">
            Не оказывает медицинских услуг и не заменяет консультацию врача.
          </span>{' '}
          При наличии заболеваний обратитесь к врачу.
        </p>

        <p className="mt-3.5 max-w-[640px] text-[11.5px] leading-[1.6] text-white/50">
          {OPERATOR.fullName} · ИНН {OPERATOR.inn}
          <br />
          Оператор персональных данных, рег. номер {OPERATOR.rknRegistrationNumber} (
          <a
            href={OPERATOR.rknRegistryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-white/75"
          >
            реестр РКН
          </a>
          )
        </p>

        {/* Вордмарк был во весь экран (до 200px) и съедал экран пустотой.
            Теперь подпись в одну строку с копирайтом. */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
          <span className="text-[12.5px] text-white/50">
            © {new Date().getFullYear()} HEYS lab
          </span>
          <span
            aria-hidden="true"
            className="select-none text-[32px] font-semibold leading-none tracking-[0.04em] text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.1)]"
          >
            HEYS
          </span>
        </div>
      </div>
    </footer>
  );
}
