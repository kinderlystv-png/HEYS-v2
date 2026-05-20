import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Старт работы куратора — HEYS',
    description: 'Краткая инструкция для нового куратора HEYS: как обрабатывать заявки, выдавать триалы, передавать доступ клиентам и работать с подписками.',
    robots: { index: false, follow: false },
};

const STEPS = [
    {
        n: 1,
        title: 'Заявки приходят на вкладку «Очередь»',
        body: (
            <>
                Когда клиент оставляет заявку на лендинге, она попадает в Telegram-чат кураторов{' '}
                <em>и</em> на вкладку <strong>«Очередь»</strong> в приложении. Если есть новые
                заявки — на табе появляется красный бейдж с числом. Polling каждые 30 секунд,
                так что F5 нажимать не нужно.
            </>
        ),
    },
    {
        n: 2,
        title: 'Одобряете лида — PIN генерируется автоматически',
        body: (
            <>
                Открываете заявку, нажимаете <strong>«Создать клиента»</strong>. Сервер сам
                сгенерирует случайный 4-значный PIN и одноразовую ссылку{' '}
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                    t.me/&lt;bot&gt;?start=&lt;token&gt;
                </code>
                . Вручную PIN придумывать не нужно.
            </>
        ),
    },
    {
        n: 3,
        title: 'Передаёте PIN и ссылку клиенту',
        body: (
            <>
                В модалке «Клиент создан» две кнопки: <strong>«Скопировать PIN»</strong> и{' '}
                <strong>«Открыть в Telegram»</strong>. Пишете клиенту в Telegram/WhatsApp/MAX
                (тот мессенджер, который он указал в форме) PIN и эту ссылку. Когда клиент
                откроет ссылку — наш бот пришлёт ему инструкцию входа и сохранит chat_id для
                drip-напоминаний.
            </>
        ),
    },
    {
        n: 4,
        title: 'Активируете триал на 7 дней',
        body: (
            <>
                После того как клиент создан — на вкладке «Очередь» появляется кнопка{' '}
                <strong>«Активировать триал»</strong>. Можно сразу или запланировать на дату.
                Триал-таймер стартует с момента первого логина клиента, не с момента
                активации.
            </>
        ),
    },
    {
        n: 5,
        title: 'Drip-напоминания работают сами',
        body: (
            <>
                В дни 0 / 3 / 5 / 6 / 7 триала клиент получит сообщения в Telegram-боте от
                нашей системы (welcome → mid → prepay → lastcall → expired). Cron-скрипт
                запускается ежедневно в 10:00. Если клиент не открыл deep-link — drip ему
                не уйдёт, и об этом будет видно в логах.
            </>
        ),
    },
    {
        n: 6,
        title: 'После 7 дней — pay-wall',
        body: (
            <>
                Триал истекает → клиент автоматически переходит в <code>read_only</code> →
                видит красную плашку «Доступ ограничен». Внутри приложения есть pay-wall с
                тремя тарифами (Base 2 990 ₽ / Pro 7 990 ₽ / Pro+ 14 990 ₽). После оплаты
                ЮKassa-webhook сам активирует подписку.
            </>
        ),
    },
    {
        n: 7,
        title: 'Возврат денег — кнопка в карточке клиента',
        body: (
            <>
                Если клиент попросил возврат — в карточке клиента кнопка{' '}
                <strong>«💰 Вернуть деньги»</strong>. Откроет последний платёж, после
                подтверждения дёрнет ЮKassa Refund. Клиент сразу переводится в read_only,
                деньги вернутся на карту в течение 7-10 рабочих дней.
            </>
        ),
    },
    {
        n: 8,
        title: 'Перевыпуск PIN, если клиент потерял',
        body: (
            <>
                В карточке клиента — кнопка <strong>«Перевыпустить PIN»</strong>. Будет
                сгенерирован новый PIN и новая deep-link ссылка. Старые сразу
                инвалидируются.
            </>
        ),
    },
];

export default function CuratorOnboardingPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm p-8 mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        👋 Добро пожаловать, куратор!
                    </h1>
                    <p className="text-gray-600">
                        Это краткая инструкция, как пройти весь цикл работы с клиентом — от заявки
                        с лендинга до активной подписки. Прочтите один раз перед началом работы.
                    </p>
                </div>

                <ol className="space-y-4">
                    {STEPS.map((step) => (
                        <li
                            key={step.n}
                            className="bg-white rounded-xl border border-gray-200 p-6 flex gap-5"
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
                                {step.n}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                                    {step.title}
                                </h2>
                                <p className="text-gray-700 leading-relaxed">{step.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>

                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h3 className="font-semibold text-blue-900 mb-2">
                        🔑 Что делать, если что-то пошло не так
                    </h3>
                    <ul className="list-disc list-inside text-sm text-blue-900/80 space-y-1">
                        <li>
                            Клиент не получил PIN — проверьте, что Telegram-бот включён, и
                            перевыпустите PIN.
                        </li>
                        <li>
                            Платёж в статусе <code>pending</code> &gt; 10 мин — проверьте логи
                            cron-payments-poll.js, он опрашивает ЮKassa каждые 5 минут.
                        </li>
                        <li>
                            Webhook ЮKassa не пришёл — IP-allowlist проверяется автоматически,
                            HMAC-секрет настроен в Lockbox.
                        </li>
                        <li>
                            Клиент жалуется на блокировку доступа — проверьте{' '}
                            <code>subscription_status</code> в карточке. Если read_only — нужно
                            либо «Активировать триал», либо клиенту оплатить тариф.
                        </li>
                    </ul>
                </div>

                <div className="mt-6 text-center">
                    <Link
                        href="https://app.heyslab.ru"
                        className="inline-block px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                    >
                        Открыть кураторскую панель →
                    </Link>
                </div>

                <p className="text-xs text-gray-400 text-center mt-8">
                    Версия инструкции: 1.0 от 28 апреля 2026 г.
                </p>
            </div>
        </main>
    );
}
