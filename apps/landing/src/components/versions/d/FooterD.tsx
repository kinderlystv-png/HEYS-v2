// Футер версии D.
//
// Собственная вёрстка (тёмный фон, гигантский контурный вордмарк), но состав
// обязательных элементов тот же, что в общем `FooterSSR`: правовые ссылки,
// медицинский дисклеймер, реквизиты оператора и запись в реестре РКН.
// Реквизиты берутся из `OPERATOR`, версии документов — из `LEGAL_DOCS`:
// хардкод здесь разошёлся бы с legal-страницами при первом же обновлении.

import { LogoD } from './LogoD';

import { OPERATOR, SUPPORT_CONTACTS } from '@/config/legal-versions';

const LEGAL_LINKS = [
  { href: '/legal/user-agreement', label: 'Пользовательское соглашение' },
  { href: '/legal/privacy-policy', label: 'Политика конфиденциальности' },
  { href: '/legal/health-data-consent', label: 'Данные о здоровье' },
  { href: '/legal/marketing-consent', label: 'Маркетинговые материалы' },
  { href: '/legal/refund', label: 'Возврат' },
  { href: '/legal/cookie-policy', label: 'Cookies' },
  { href: '/legal/agreements', label: 'Все документы' },
];

export default function FooterD() {
  return (
    <footer className="overflow-hidden bg-[#0A1119] px-5 pb-12 pt-16 sm:px-8">
      <div className="mx-auto w-full max-w-[1060px]">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <LogoD size={22} />
            <p className="mt-4 text-[14px] leading-[1.6] text-white/55">
              Человек, который вникает в вашу неделю
            </p>
            <p className="mt-5 text-[13px] leading-[1.8] text-white/45">
              <a
                href={SUPPORT_CONTACTS.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white/80"
              >
                {SUPPORT_CONTACTS.telegramHandle}
              </a>
              <br />
              <a
                href={`mailto:${SUPPORT_CONTACTS.generalEmail}`}
                className="transition-colors hover:text-white/80"
              >
                {SUPPORT_CONTACTS.generalEmail}
              </a>
            </p>
          </div>

          <nav className="flex flex-col gap-2.5 text-[13px] sm:items-end">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-white/55 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <p
          aria-hidden="true"
          className="mt-12 select-none text-center text-[clamp(90px,16vw,200px)] font-bold leading-none tracking-tight text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.08)]"
        >
          HEYS
        </p>

        <div className="mt-8 border-t border-white/10 pt-8">
          <p className="text-center text-[13px] leading-[1.7] text-white/45">
            HEYS — сервис сопровождения по режиму питания, привычкам и образу жизни. Не оказывает
            медицинских услуг и не заменяет консультацию врача. При наличии заболеваний обратитесь к
            врачу.
          </p>
          <p className="mt-5 text-center text-[12.5px] leading-[1.7] text-white/35">
            {OPERATOR.fullName} · ИНН {OPERATOR.inn} · Оператор персональных данных, регистрационный
            номер {OPERATOR.rknRegistrationNumber} (
            <a
              href={OPERATOR.rknRegistryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-white/60"
            >
              реестр РКН
            </a>
            )
          </p>
          <p className="mt-3 text-center text-[12.5px] text-white/30">
            © {new Date().getFullYear()} HEYS
          </p>
        </div>
      </div>
    </footer>
  );
}
