import React from 'react';

import { ClientListItem } from '../components/ClientListItem';
import { useCuratorClients } from '../hooks/useCuratorClients';
import type { CuratorClient, CuratorSession, GetClientsParams } from '../types/api';

const STATUS_FILTERS: Array<{ value: GetClientsParams['status']; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'paused', label: 'На паузе' },
  { value: 'archived', label: 'Архив' }
];

export interface ClientListScreenProps {
  session: CuratorSession | null;
  isAuthorized: boolean;
  onSelectClient(client: CuratorClient): void;
}

export function ClientListScreen({ session, isAuthorized, onSelectClient }: ClientListScreenProps) {
  const isDevFallback = session?.isDevFallback === true;
  const {
    clients,
    isLoading,
    isError,
    errorMessage,
    page,
    totalPages,
    search,
    status,
    setSearch,
    setStatus,
    setPage,
    nextPage,
    prevPage,
    reload
  } = useCuratorClients({ perPage: 10, enabled: isAuthorized || isDevFallback, session });

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(1);
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value as GetClientsParams['status']);
    setPage(1);
  };

  const renderState = () => {
    if (!session) {
      return (
        <p style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '32px', textAlign: 'center' }}>
          Авторизуйтесь через Telegram, чтобы увидеть список клиентов.
        </p>
      );
    }

    if (isLoading) {
      return (
        <p style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '32px', textAlign: 'center' }}>
          Загружаем клиентов...
        </p>
      );
    }

    if (isError) {
      return (
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <p style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginBottom: '12px' }}>{errorMessage}</p>
          <button
            type="button"
            onClick={reload}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--tg-theme-button-color, #2481cc)',
              color: 'var(--tg-theme-button-text-color, #ffffff)',
              fontSize: '14px'
            }}
          >
            Повторить
          </button>
        </div>
      );
    }

    if (clients.length === 0) {
      return (
        <p style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '32px', textAlign: 'center' }}>
          {search ? `По запросу «${search}» ничего не найдено` : 'У вас пока нет клиентов'}
        </p>
      );
    }

    return (
      <div>
        {clients.map((client) => (
          <ClientListItem key={client.id} client={client} onClick={() => onSelectClient(client)} />
        ))}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <button
              type="button"
              onClick={prevPage}
              disabled={page === 1}
              style={paginationButtonStyle(page === 1)}
            >
              ← Назад
            </button>
            <span style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              onClick={nextPage}
              disabled={page === totalPages}
              style={paginationButtonStyle(page === totalPages)}
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Список клиентов</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
          Быстрый поиск и переход к карточке клиента
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Поиск по имени или email"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid var(--tg-theme-secondary-bg-color, #dcdcdc)',
            background: 'var(--tg-theme-bg-color, #ffffff)',
            fontSize: '14px'
          }}
        />

        <select
          value={status ?? 'all'}
          onChange={handleStatusChange}
          style={{
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid var(--tg-theme-secondary-bg-color, #dcdcdc)',
            background: 'var(--tg-theme-bg-color, #ffffff)',
            fontSize: '14px'
          }}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value ?? 'all'}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {renderState()}
    </div>
  );
}

function paginationButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'var(--tg-theme-secondary-bg-color, #e0e0e0)' : 'var(--tg-theme-button-color, #2481cc)',
    color: disabled ? '#9e9e9e' : 'var(--tg-theme-button-text-color, #ffffff)'
  };
}
