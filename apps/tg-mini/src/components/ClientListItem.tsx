import type { CuratorClient } from '../types/api';

const STATUS_LABELS: Record<CuratorClient['status'], string> = {
  active: 'Активный',
  paused: 'На паузе',
  archived: 'Архив'
};

const STATUS_COLORS: Record<CuratorClient['status'], string> = {
  active: 'var(--tg-theme-button-color, #2ea97d)',
  paused: '#ffb74d',
  archived: '#bdbdbd'
};

interface ClientListItemProps {
  client: CuratorClient;
  onClick(): void;
}

export function ClientListItem({ client, onClick }: ClientListItemProps) {
  const summary = client.todaySummary;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        background: 'var(--tg-theme-bg-color, #ffffff)',
        cursor: 'pointer'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>{client.name}</div>
          {client.email && (
            <div style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>{client.email}</div>
          )}
        </div>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 600,
            background: `${STATUS_COLORS[client.status]}22`,
            color: STATUS_COLORS[client.status]
          }}
        >
          {STATUS_LABELS[client.status]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '8px' }}>
        <StatItem label="Калории" value={summary ? `${summary.calories} ккал` : '—'} />
        <StatItem label="Выполнение" value={summary ? `${summary.caloriesPercent}%` : '—'} />
        <StatItem label="Приёмы" value={summary ? `${summary.mealsCount}` : '—'} />
      </div>

      <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
        Последняя активность: {formatLastActivity(client.lastActivityAt)}
      </div>
    </button>
  );
}

interface StatItemProps {
  label: string;
  value: string;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function formatLastActivity(isoDate?: string) {
  if (!isoDate) {
    return 'нет данных';
  }

  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (diffMs < oneDayMs) {
    return `сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (diffMs < 2 * oneDayMs) {
    return `вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
