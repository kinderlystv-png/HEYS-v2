// components/UsersTabPanel/components/LoadingSpinner.tsx - Компонент загрузки

import React, { memo } from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Загрузка...',
  size = 'medium',
  className = ''
}) => {
  return (
    <div className={`loading-spinner ${size} ${className}`} role="status" aria-live="polite">
      <div className="spinner-icon" aria-hidden="true">
        <div className="spinner-circle"></div>
      </div>
      <span className="spinner-message">{message}</span>
    </div>
  );
};

export default memo(LoadingSpinner);
