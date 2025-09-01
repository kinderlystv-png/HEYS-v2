/**
 * HEYS UI Security Integration
 * Security-enhanced UI components with validation and sanitization
 * 
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import React, { useCallback, useMemo } from 'react';
import { defaultValidator, ValidationSchemas, SecurityError } from '@heys/shared';

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
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [onChange, type, required, maxLength, sanitize, validateOnChange]);

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
  }, [content, maxLength]);

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
export interface SecureFormProps {
  onSubmit: (data: Record<string, any>) => Promise<void>;
  children: React.ReactNode;
  validationSchema?: any;
  className?: string;
  'data-testid'?: string;
}

export const SecureForm: React.FC<SecureFormProps> = ({
  onSubmit,
  children,
  validationSchema,
  className,
  'data-testid': testId,
}) => {
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const formData = new FormData(event.currentTarget);
    const data: Record<string, any> = {};
    
    // Extract form data
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Validate if schema provided
    if (validationSchema) {
      const validation = await defaultValidator.validateSchema(
        data,
        validationSchema,
        { sanitize: true, strictMode: true }
      );

      if (!validation.isValid) {
        throw new SecurityError('Form validation failed', validation.errors);
      }

      // Use sanitized data
      Object.assign(data, validation.sanitized || {});
    }

    await onSubmit(data);
  }, [onSubmit, validationSchema]);

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      data-testid={testId}
    >
      {children}
    </form>
  );
};

/**
 * Security-enhanced user profile component
 */
export interface SecureUserProfileProps {
  user: {
    id: string;
    email: string;
    username: string;
    avatar?: string;
    bio?: string;
  };
  onUpdate?: (user: any) => Promise<void>;
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
    const validation = await defaultValidator.validateSchema(
      formData,
      ValidationSchemas.user,
      { sanitize: true, strictMode: true }
    );

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
          <button
            onClick={() => setIsEditing(true)}
            data-testid="edit-profile-button"
          >
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
          onChange={(email) => setFormData(prev => ({ ...prev, email }))}
          type="email"
          placeholder="Email"
          required
          data-testid="email-input"
        />
        <SecureInput
          value={formData.username}
          onChange={(username) => setFormData(prev => ({ ...prev, username }))}
          type="text"
          placeholder="Username"
          required
          maxLength={50}
          data-testid="username-input"
        />
        <SecureInput
          value={formData.bio || ''}
          onChange={(bio) => setFormData(prev => ({ ...prev, bio }))}
          type="text"
          placeholder="Bio"
          maxLength={500}
          data-testid="bio-input"
        />
        <button type="submit" data-testid="save-button">
          Save
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          data-testid="cancel-button"
        >
          Cancel
        </button>
      </SecureForm>
    </div>
  );
};

/**
 * Security-enhanced search component
 */
export interface SecureSearchProps {
  onSearch: (query: string) => Promise<any[]>;
  placeholder?: string;
  debounceMs?: number;
  maxLength?: number;
  className?: string;
}

export const SecureSearch: React.FC<SecureSearchProps> = ({
  onSearch,
  placeholder = "Search...",
  debounceMs = 300,
  maxLength = 100,
  className,
}) => {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<any[]>([]);
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
          const searchResults = await onSearch((validation.sanitized as string) || query);
          setResults(searchResults);
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, onSearch, debounceMs, maxLength]);

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
        {results.map((result, index) => (
          <div key={result.id || index} data-testid={`search-result-${index}`}>
            <SecureContent content={result.title || result.name || String(result)} />
          </div>
        ))}
      </div>
    </div>
  );
};
