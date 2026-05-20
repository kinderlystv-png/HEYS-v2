import type { Metadata } from 'next';

import { LEGAL_DOCS, OPERATOR, SUPPORT_CONTACTS } from '@/config/legal-versions';

const DOC = LEGAL_DOCS.cookiePolicy;

export const metadata: Metadata = {
  title: 'Политика использования cookies — HEYS',
  description: 'Какие файлы cookie использует сайт HEYS и как ими управлять',
};

export default function CookiePolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Политика использования файлов cookie</h1>

      <p className="text-sm text-gray-500">
        Версия: {DOC.version} · Дата вступления в силу: {DOC.effectiveDate}
      </p>

      <hr />

      <h2>1. Что такое cookies</h2>

      <p>
        Cookies — это небольшие текстовые файлы, которые сайт сохраняет в браузере
        пользователя. Они нужны, чтобы запоминать настройки, поддерживать сессии
        и собирать обезличенную статистику посещений.
      </p>

      <p>
        Оператор сайта heyslab.ru — {OPERATOR.fullName}
        {' '}(ИНН {OPERATOR.inn}, ОГРНИП {OPERATOR.ogrnip}), контакт:{' '}
        <a href={`mailto:${SUPPORT_CONTACTS.privacyEmail}`}>{SUPPORT_CONTACTS.privacyEmail}</a>.
      </p>

      <hr />

      <h2>2. Какие cookies мы используем</h2>

      <h3>2.1. Технические cookies (обязательные)</h3>

      <p>
        Необходимы для работы сайта. Без них часть функций не будет доступна.
      </p>

      <table>
        <thead>
          <tr>
            <th>Имя cookie</th>
            <th>Назначение</th>
            <th>Срок</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>heys_cookie_info_seen</code></td>
            <td>Запоминает, что пользователь прочёл уведомление о cookies, и не показывает баннер повторно</td>
            <td>localStorage (бессрочно до очистки браузера)</td>
          </tr>
          <tr>
            <td>Сессионные cookies браузера</td>
            <td>Поддержание сессии при навигации между страницами</td>
            <td>До закрытия вкладки</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2. Аналитические cookies</h3>

      <p>
        Собирают <strong>обезличенную</strong> статистику использования сайта:
        сколько людей заходит, откуда приходят, какие страницы открывают.
        Не идентифицируют конкретного человека.
      </p>

      <table>
        <thead>
          <tr>
            <th>Сервис</th>
            <th>Что собирает</th>
            <th>Получатель</th>
            <th>Срок хранения</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Яндекс.Метрика</strong></td>
            <td>Количество визитов, источники переходов, clickmap, переходы по ссылкам</td>
            <td>ООО «Яндекс», РФ (данные хранятся в РФ)</td>
            <td>До 2 лет</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Запись действий пользователя (Webvisor) — отключена.</strong>{' '}
        Сервис не пишет видеозаписи сессий, движения мыши и заполнение форм.
      </p>

      <h3>2.3. Рекламные / маркетинговые cookies</h3>

      <p>
        <strong>Не используются.</strong> Сайт не подключает сторонние рекламные
        сети (Google Ads, Meta Pixel, ВКонтакте Pixel и т. п.). Трансграничная
        передача персональных данных не осуществляется.
      </p>

      <hr />

      <h2>3. Как отключить cookies</h2>

      <h3>3.1. В настройках браузера</h3>

      <p>
        Современные браузеры позволяют отключить cookies полностью или для
        конкретных сайтов:
      </p>

      <ul>
        <li>
          <strong>Chrome / Edge</strong>: Настройки → Конфиденциальность
          и безопасность → Файлы cookie
        </li>
        <li>
          <strong>Firefox</strong>: Настройки → Приватность и защита → Cookie
          и данные сайтов
        </li>
        <li>
          <strong>Safari</strong>: Настройки → Конфиденциальность → Управление
          данными сайтов
        </li>
      </ul>

      <p>
        Отключение cookies может повлиять на работу части функций сайта.
      </p>

      <h3>3.2. Через блокировщики трекеров</h3>

      <p>
        Расширения вроде uBlock Origin, Privacy Badger, AdGuard и аналогичные
        позволяют точечно блокировать аналитические скрипты.
      </p>

      <hr />

      <h2>4. Связь с Политикой конфиденциальности</h2>

      <p>
        Настоящая Политика дополняет общую{' '}
        <a href="/legal/privacy-policy">Политику конфиденциальности</a>.
        Раздел 10 Политики конфиденциальности содержит то же описание
        в кратком виде. При расхождении приоритет — у настоящей Политики
        использования cookies (как более детального документа).
      </p>

      <hr />

      <h2>5. Изменения</h2>

      <p>
        Мы можем обновлять настоящую Политику. При существенных изменениях
        обновим дату наверху документа.
      </p>

      <p>
        Вопросы — на{' '}
        <a href={`mailto:${SUPPORT_CONTACTS.privacyEmail}`}>{SUPPORT_CONTACTS.privacyEmail}</a>.
      </p>
    </article>
  );
}
