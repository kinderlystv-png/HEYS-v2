import type { Metadata } from 'next';

import { LEGAL_DOCS } from '@/config/legal-versions';

const DOC = LEGAL_DOCS.healthDataConsent;

export const metadata: Metadata = {
  title: 'Согласие на обработку данных о здоровье — архив — HEYS',
  description:
    'Документ прекратил действие 14 августа 2026 г. Специальная категория персональных данных в сервисе не обрабатывается.',
};

export default function HealthDataConsentPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Согласие на обработку данных о здоровье</h1>

      <p className="text-sm text-gray-500">
        Версия: {DOC.version} · Дата вступления в силу: {DOC.effectiveDate} · Документ прекратил
        действие 14 августа 2026 г.
      </p>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Документ изъят из обязательного набора согласий и не переиздаётся. Специальная категория
        персональных данных в сервисе не обрабатывается. Действующее согласие —{' '}
        <a href="/legal/personal-data-consent">«Согласие на обработку персональных данных»</a>.
        Снимок версии 1.5 хранится в архиве:{' '}
        <a href="https://app.heyslab.ru/docs/v1.5/health-data-consent.md">
          app.heyslab.ru/docs/v1.5/health-data-consent.md
        </a>
        .
      </p>
    </article>
  );
}
