/**
 * HEYS UI Security Integration
 * Security-enhanced UI components with validation and sanitization
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { defaultValidator, SecurityError, ValidationSchemas } from '@heys/shared';
import { log as systemLog } from '@heys/logger';
import React, { useCallback, useMemo } from 'react';

type BrowserLogger = {
  error?: (details: Record<string, unknown>, message?: string) => void;
};

const uiLog = {
  error(message: string, context?: Record<string, unknown>) {
    if (typeof window !== 'undefined') {
      const heysLogger = (window as unknown as { HEYS?: { logger?: BrowserLogger } }).HEYS?.logger;
      if (heysLogger?.error) {
        heysLogger.error(context ?? {}, message);
        return;
      }
    }

    try {
      systemLog.error(message, context ?? {});
    } catch {
      if (typeof globalThis !== 'undefined' && globalThis.console?.error) {
        // eslint-disable-next-line no-console
        globalThis.console.error(`[ui-security] ${message}`, context);
      }
    }
  },
};

/**
 * Security-enhanced form input component
 */
export interface SecureInputProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'url' | 'password';
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  sanitize?: boolean;
  validateOnChange?: boolean;
  className?: string;
  'data-testid'?: string;
}

export const SecureInput: React.FC<SecureInputProps> = ({
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  maxLength,
  sanitize = true,
  validateOnChange = true,
  className,
  'data-testid': testId,
}) => {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = event.target.value;

      if (validateOnChange) {
        // Validate input based on type
        let inputType: 'text' | 'email' | 'password' | 'html' | 'filename' = 'text';
        if (type === 'email') inputType = 'email';
        else if (type === 'password') inputType = 'password';

        const validation = defaultValidator.validateInput(newValue, inputType, {
          required,
          sanitize,
        });

        if (!validation.isValid && required) {
          // Don't update if validation fails for required fields
          return;
        }

        newValue = (validation.sanitized as string) || newValue;
      }

      onChange(newValue);
    },
    [onChange, type, required, sanitize, validateOnChange],
  );

  return (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      className={className}
      data-testid={testId}
    />
  );
};

/**
 * Security-enhanced content display component
 */
export interface SecureContentProps {
  content: string;
  allowHtml?: boolean;
  maxLength?: number;
  className?: string;
  'data-testid'?: string;
}

export const SecureContent: React.FC<SecureContentProps> = ({
  content,
  allowHtml = false,
  maxLength,
  className,
  'data-testid': testId,
}) => {
  const sanitizedContent = useMemo(() => {
    const validation = defaultValidator.validateInput(content, 'html', {
      sanitize: true,
    });

    return (validation.sanitized as string) || content;
  }, [content]);

  if (allowHtml) {
    return (
      <div
        className={className}
        data-testid={testId}
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    );
  }

  return (
    <div className={className} data-testid={testId}>
      {sanitizedContent}
    </div>
  );
};

/**
 * Security-enhanced form component
 */
export interface SecureFormProps<T extends Record<string, unknown> = Record<string, unknown>> {
  onSubmit: (data: T) => Promise<void>;
  children: React.ReactNode;
  validationSchema?: unknown;
  className?: string;
  'data-testid'?: string;
}

export const SecureForm = <T extends Record<string, unknown> = Record<string, unknown>>({
  onSubmit,
  children,
  validationSchema,
  className,
  'data-testid': testId,
}: SecureFormProps<T>) => {
  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const data: Record<string, unknown> = {};

      // Extract form data
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }

      // Validate if schema provided
      if (validationSchema) {
        const validation = await defaultValidator.validateSchema(data, validationSchema, {
          sanitize: true,
          strictMode: true,
        });

        if (!validation.isValid) {
          throw new SecurityError('Form validation failed', validation.errors);
        }

        // Use sanitized data
        if (validation.sanitized && typeof validation.sanitized === 'object') {
          Object.assign(data, validation.sanitized as Record<string, unknown>);
        }
      }

      await onSubmit(data as T);
    },
    [onSubmit, validationSchema],
  );

  return (
    <form onSubmit={handleSubmit} className={className} data-testid={testId}>
      {children}
    </form>
  );
};

/**
 * Security-enhanced user profile component
 */
export interface SecureUserProfileData {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  bio?: string;
}

export interface SecureUserProfileProps {
  user: SecureUserProfileData;
  onUpdate?: (user: SecureUserProfileData) => Promise<void>;
  editable?: boolean;
  className?: string;
}

export const SecureUserProfile: React.FC<SecureUserProfileProps> = ({
  user,
  onUpdate,
  editable = false,
  className,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [formData, setFormData] = React.useState(user);

  const handleSave = useCallback(async () => {
    if (!onUpdate) return;

    // Validate user data
    const validation = await defaultValidator.validateSchema(formData, ValidationSchemas.user, {
      sanitize: true,
      strictMode: true,
    });

    if (!validation.isValid) {
      throw new SecurityError('User profile validation failed', validation.errors);
    }

    await onUpdate(validation.sanitized || formData);
    setIsEditing(false);
  }, [formData, onUpdate]);

  if (!editable || !isEditing) {
    return (
      <div className={className} data-testid="user-profile">
        <div data-testid="user-email">
          <SecureContent content={user.email} />
        </div>
        <div data-testid="user-username">
          <SecureContent content={user.username} />
        </div>
        {user.bio && (
          <div data-testid="user-bio">
            <SecureContent content={user.bio} maxLength={500} />
          </div>
        )}
        {editable && (
          <button onClick={() => setIsEditing(true)} data-testid="edit-profile-button">
            Edit Profile
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={className} data-testid="user-profile-edit">
      <SecureForm
        onSubmit={handleSave}
        validationSchema={ValidationSchemas.user}
        data-testid="profile-form"
      >
        <SecureInput
          value={formData.email}
          onChange={(email) => setFormData((prev) => ({ ...prev, email }))}
          type="email"
          placeholder="Email"
          required
          data-testid="email-input"
        />
        <SecureInput
          value={formData.username}
          onChange={(username) => setFormData((prev) => ({ ...prev, username }))}
          type="text"
          placeholder="Username"
          required
          maxLength={50}
          data-testid="username-input"
        />
        <SecureInput
          value={formData.bio || ''}
          onChange={(bio) => setFormData((prev) => ({ ...prev, bio }))}
          type="text"
          placeholder="Bio"
          maxLength={500}
          data-testid="bio-input"
        />
        <button type="submit" data-testid="save-button">
          Save
        </button>
        <button type="button" onClick={() => setIsEditing(false)} data-testid="cancel-button">
          Cancel
        </button>
      </SecureForm>
    </div>
  );
};

/**
 * Security-enhanced search component
 */
export interface SecureSearchProps<T extends Record<string, unknown> = Record<string, unknown>> {
  onSearch: (query: string) => Promise<T[]>;
  placeholder?: string;
  debounceMs?: number;
  maxLength?: number;
  className?: string;
}

const formatSearchResult = (result: Record<string, unknown>): string => {
  if (typeof result.title === 'string') {
    return result.title;
  }

  if (typeof result.name === 'string') {
    return result.name;
  }

  if (typeof result.label === 'string') {
    return result.label;
  }

  return JSON.stringify(result);
};

export const SecureSearch = <T extends Record<string, unknown> = Record<string, unknown>>({
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
  maxLength = 100,
  className,
}: SecureSearchProps<T>) => {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<T[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Debounced search
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Validate and sanitize search query
        const validation = defaultValidator.validateInput(query, 'text', {
          sanitize: true,
          required: true,
        });

        if (validation.isValid) {
          const sanitizedQuery = (validation.sanitized as string) || query;
          const searchResults = await onSearch(sanitizedQuery);
          setResults(searchResults);
        }
      } catch (error) {
        uiLog.error('SecureSearch query failed', { error, query });
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, onSearch, debounceMs]);

  return (
    <div className={className} data-testid="secure-search">
      <SecureInput
        value={query}
        onChange={setQuery}
        type="text"
        placeholder={placeholder}
        maxLength={maxLength}
        data-testid="search-input"
      />
      {isLoading && <div data-testid="search-loading">Loading...</div>}
      <div data-testid="search-results">
        {results.map((result, index) => {
          const record = result as Record<string, unknown>;
          const resultId = (record.id as string | number | undefined) ?? index;
          const displayValue = formatSearchResult(record);

          return (
            <div key={resultId} data-testid={`search-result-${index}`}>
              <SecureContent content={displayValue} />
          </div>
          );
        })}
      </div>
    </div>
  );
};
