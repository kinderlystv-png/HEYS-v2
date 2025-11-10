// components/UsersTabPanel/components/UsersFilters.tsx - Фильтры для пользователей

import React, { memo } from 'react';

interface FilterOption {
  value: string;
  label: string;
}

interface UsersFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  roleFilter: string;
  setRoleFilter: (role: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  roleOptions: FilterOption[];
  statusOptions: FilterOption[];
  sortOptions: FilterOption[];
  onClearFilters: () => void;
  disabled?: boolean;
  className?: string;
}

const UsersFilters: React.FC<UsersFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  roleOptions,
  statusOptions,
  sortOptions,
  onClearFilters,
  disabled = false,
  className = '',
}) => {
  const hasActiveFilters = searchTerm || roleFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className={`users-filters ${className}`}>
      <div className="filters-row">
        <div className="filter-group search-group">
          <label htmlFor="user-search" className="filter-label">
            Поиск:
          </label>
          <input
            id="user-search"
            type="text"
            className="filter-input search-input"
            placeholder="Поиск по имени или email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="role-filter" className="filter-label">
            Роль:
          </label>
          <select
            id="role-filter"
            className="filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            disabled={disabled}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter" className="filter-label">
            Статус:
          </label>
          <select
            id="status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={disabled}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="sort-by" className="filter-label">
            Сортировка:
          </label>
          <select
            id="sort-by"
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            disabled={disabled}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="sort-order" className="filter-label">
            Порядок:
          </label>
          <select
            id="sort-order"
            className="filter-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            disabled={disabled}
          >
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="filter-group">
            <button
              type="button"
              className="clear-filters-button"
              onClick={onClearFilters}
              disabled={disabled}
              title="Очистить все фильтры"
            >
              ✕ Очистить фильтры
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UsersFilters);
