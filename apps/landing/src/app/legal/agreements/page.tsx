import type { Metadata } from 'next';

import { LEGAL_DOCS, OPERATOR, SUPPORT_CONTACTS } from '@/config/legal-versions';

export const metadata: Metadata = {
    title: 'Юридические документы — HEYS',
    description: 'Пользовательское соглашение, Политика конфиденциальности и другие юридические документы сервиса HEYS',
};

export default function AgreementsPage() {
    const documents = [
        {
            title: 'Пользовательское соглашение (Оферта)',
            href: '/legal/user-agreement',
            version: LEGAL_DOCS.userAgreement.version,
            description: 'Условия использования сервиса HEYS, тарифы, права и обязанности сторон, медицинский дисклеймер.',
            icon: '🤝',
        },
        {
            title: 'Политика конфиденциальности',
            href: '/legal/privacy-policy',
            version: LEGAL_DOCS.privacyPolicy.version,
            description: 'Какие данные мы собираем, как обрабатываем и защищаем. Соответствие 152-ФЗ.',
            icon: '🔒',
        },
        {
            title: 'Согласие на обработку данных о здоровье',
            href: '/legal/health-data-consent',
            version: LEGAL_DOCS.healthDataConsent.version,
            description: 'Отдельное согласие на обработку специальной категории персональных данных (ст. 10 152-ФЗ).',
            icon: '❤️',
        },
        {
            title: 'Условия возврата денежных средств',
            href: '/legal/refund',
            version: LEGAL_DOCS.refund.version,
            description: 'Сроки и порядок возврата средств за оплаченные подписки тарифов Self, Pro, Pro+.',
            icon: '💰',
        },
        {
            title: 'Политика использования cookies',
            href: '/legal/cookie-policy',
            version: LEGAL_DOCS.cookiePolicy.version,
            description: 'Какие файлы cookie использует сайт, какая аналитика подключена и как ими управлять.',
            icon: '🍪',
        },
    ];

    return (
        <article className="prose prose-gray max-w-none">
            <h1>Юридические документы</h1>

            <p className="text-gray-600">
                Ниже перечислены все юридические документы, регулирующие использование сервиса HEYS.
                Ознакомьтесь с ними перед использованием сервиса или оформлением подписки.
            </p>

            <hr />

            <div className="not-prose grid gap-4 mt-6">
                {documents.map((doc) => (
                    <a
                        key={doc.href}
                        href={doc.href}
                        className="block p-5 rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50/30 transition-all group"
                    >
                        <div className="flex items-start gap-4">
                            <span className="text-3xl flex-shrink-0">{doc.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                                        {doc.title}
                                    </h3>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                        v{doc.version}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                            </div>
                            <svg
                                className="w-5 h-5 text-gray-400 group-hover:text-green-500 flex-shrink-0 mt-1 transition-colors"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </a>
                ))}
            </div>

            <hr className="mt-8" />

            <h2>Оператор персональных данных</h2>

            <p>
                {OPERATOR.fullName}<br />
                ИНН: {OPERATOR.inn}<br />
                ОГРНИП: {OPERATOR.ogrnip}<br />
                Адрес: {OPERATOR.address}
            </p>

            <h2>Контакты</h2>

            <ul>
                <li><strong>Общие вопросы:</strong> <a href={`mailto:${SUPPORT_CONTACTS.generalEmail}`}>{SUPPORT_CONTACTS.generalEmail}</a></li>
                <li><strong>Персональные данные:</strong> <a href={`mailto:${SUPPORT_CONTACTS.privacyEmail}`}>{SUPPORT_CONTACTS.privacyEmail}</a></li>
                <li><strong>Telegram:</strong> <a href={SUPPORT_CONTACTS.telegramUrl} target="_blank" rel="noopener noreferrer">{SUPPORT_CONTACTS.telegramHandle}</a></li>
            </ul>

            <hr />

            <p className="text-sm text-gray-500 italic">
                Используя сервис HEYS, вы подтверждаете, что ознакомились и согласны с указанными документами.
            </p>
        </article>
    );
}
