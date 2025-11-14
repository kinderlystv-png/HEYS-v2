import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, fetchCuratorClients } from '../api/clients';
import type { CuratorClient, CuratorSession, GetClientsParams } from '../types/api';

const DEFAULT_PER_PAGE = 20;

interface UseCuratorClientsOptions {
  initialPage?: number;
  initialStatus?: GetClientsParams['status'];
  perPage?: number;
  enabled?: boolean;
  session?: CuratorSession | null;
}

interface UseCuratorClientsResult {
  clients: CuratorClient[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  page: number;
  totalPages: number;
  search: string;
  status: GetClientsParams['status'];
  setSearch(value: string): void;
  setStatus(value: GetClientsParams['status']): void;
  setPage(value: number): void;
  nextPage(): void;
  prevPage(): void;
  reload(): void;
}

export function useCuratorClients(options?: UseCuratorClientsOptions): UseCuratorClientsResult {
  const session = options?.session ?? null;
  const enabledFlag = options?.enabled ?? true;
  const useMocks = !import.meta.env || import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';
  const enabled = Boolean(enabledFlag && (useMocks || session?.token));
  const [clients, setClients] = useState<CuratorClient[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(options?.initialPage ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<GetClientsParams['status']>(options?.initialStatus ?? 'all');
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;
  const sessionToken = session?.token ?? null;

  const params = useMemo<GetClientsParams>(() => {
    const base: GetClientsParams = {
      page,
      perPage,
      sortBy: 'lastActivity',
      sortOrder: 'desc'
    };

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      base.search = trimmedSearch;
    }

    if (status && status !== 'all') {
      base.status = status;
    }

    return base;
  }, [page, perPage, search, status]);

  const loadClients = useCallback(async () => {
    if (!enabled || (!sessionToken && !useMocks)) {
      setClients([]);
      setIsLoading(false);
      setIsError(false);
      setErrorMessage(null);
      setTotalPages(1);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage(null);

      const response = await fetchCuratorClients(params);
      setClients(response.clients);
      const pagination = response.pagination ?? {
        page: 1,
        perPage,
        total: response.clients.length,
        totalPages: 1
      };

      setTotalPages(pagination.totalPages);
    } catch (error) {
      const statusText = error instanceof ApiError && error.status ? ` (код ${error.status})` : '';
      setIsError(true);
      setErrorMessage(`Не удалось загрузить клиентов${statusText}`);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, params, perPage, sessionToken, useMocks]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const nextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const reload = useCallback(() => {
    loadClients();
  }, [loadClients]);

  return {
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
  };
}
