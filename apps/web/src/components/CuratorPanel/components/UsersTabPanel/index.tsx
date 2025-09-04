// components/UsersTabPanel/index.tsx - Главный компонент вкладки пользователей

import React, { memo } from 'react';

import { useUsersTab } from '../../hooks/useUsersTab';

import ErrorAlert from './components/ErrorAlert';
import LoadingSpinner from './components/LoadingSpinner';
import UserDetails from './components/UserDetails';
import UsersFilters from './components/UsersFilters';
import UsersList from './components/UsersList';
import UsersStats from './components/UsersStats';

const UsersTabPanel: React.FC = () => {
  const {
    users,
    selectedUser,
    userStats,
    isLoading,
    error,
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
    handleUserSelect,
    handleRoleUpdate,
    clearFilters,
    clearSelection,
    refreshData,
  } = useUsersTab();

  if (error) {
    return (
      <div className="users-tab-panel">
        <ErrorAlert 
          message="Не удалось загрузить данные пользователей" 
          error={error}
          onRetry={refreshData}
        />
      </div>
    );
  }

  return (
    <div className="users-tab-panel" role="tabpanel" id="users-panel" aria-labelledby="users-tab">
      <div className="panel-header">
        <h2>Управление пользователями</h2>
        <UsersStats stats={userStats} isLoading={isLoading} />
      </div>

      <div className="panel-filters">
        <UsersFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          roleOptions={roleOptions}
          statusOptions={statusOptions}
          sortOptions={sortOptions}
          onClearFilters={clearFilters}
          disabled={isLoading}
        />
      </div>
      
      <div className="panel-content">
        {isLoading ? (
          <LoadingSpinner message="Загрузка пользователей..." />
        ) : (
          <div className="content-layout">
            <div className="content-main">
              <UsersList 
                users={users}
                selectedUserId={selectedUser?.id || null}
                onUserSelect={handleUserSelect}
                _onRoleUpdate={handleRoleUpdate}
              />
            </div>
            
            {selectedUser && (
              <div className="content-sidebar">
                <UserDetails 
                  user={selectedUser}
                  onRoleUpdate={handleRoleUpdate}
                  onClose={clearSelection}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UsersTabPanel);
