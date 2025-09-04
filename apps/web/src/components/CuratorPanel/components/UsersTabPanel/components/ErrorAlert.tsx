// components/UsersTabPanel/components/ErrorAlert.tsx - Компонент отображения ошибок

import React, { memo } from 'react';

interface ErrorAlertProps {
  message: string;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ 
  message, 
  error, 
  onRetry,
  className = ''
}) => {
  return (
    <div className={`error-alert ${className}`} role="alert">
      <div className="error-icon" aria-hidden="true">❌</div>
      <div className="error-content">
        <h3 className="error-title">{message}</h3>
        {error && (
          <p className="error-details">
            {error.message}
          </p>
        )}
        {onRetry && (
          <button 
            type="button"
            className="retry-button"
            onClick={onRetry}
          >
            Попробовать снова
          </button>
        )}
      </div>
    </div>
  );
};

export default memo(ErrorAlert);
