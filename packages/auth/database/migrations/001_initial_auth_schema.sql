-- filepath: packages/auth/database/migrations/001_initial_auth_schema.sql

-- =====================================================================
-- HEYS EAP 3.0 - Initial Authentication Schema
-- Migration: 001_initial_auth_schema
-- Description: Core authentication tables and base structure
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =====================================================================
-- CORE AUTHENTICATION TABLES
-- =====================================================================

-- User profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username CITEXT UNIQUE,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone_number TEXT,
    department TEXT,
    position TEXT,
    timezone TEXT DEFAULT 'UTC',
    locale TEXT DEFAULT 'en',
    
    -- Profile status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending', 'locked')),
    
    -- Security settings
    mfa_enabled BOOLEAN DEFAULT FALSE,
    security_level TEXT DEFAULT 'medium' CHECK (security_level IN ('low', 'medium', 'high', 'critical')),
    
    -- Activity tracking
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    
    -- Preferences (JSONB for flexibility)
    preferences JSONB DEFAULT '{
        "theme": "system",
        "language": "en",
        "dateFormat": "YYYY-MM-DD",
        "timeFormat": "24h",
        "notifications": {
            "email": true,
            "push": true,
            "sms": false,
            "inApp": true,
            "types": {
                "security": true,
                "system": true,
                "reports": false,
                "mentions": true
            }
        },
        "dashboard": {
            "layout": "grid",
            "widgets": [],
            "refreshInterval": 300,
            "autoRefresh": false
        }
    }'::jsonb,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', 
            COALESCE(full_name, '') || ' ' || 
            COALESCE(username, '') || ' ' || 
            COALESCE(department, '') || ' ' || 
            COALESCE(position, '')
        )
    ) STORED
);

-- Create indexes for user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON public.user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department);
CREATE INDEX IF NOT EXISTS idx_user_profiles_security_level ON public.user_profiles(security_level);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_activity ON public.user_profiles(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_search ON public.user_profiles USING GIN(search_vector);

-- =====================================================================
-- ROLES AND PERMISSIONS SYSTEM
-- =====================================================================

-- Roles table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    level INTEGER DEFAULT 0, -- Higher number = higher privilege
    color TEXT DEFAULT '#6366f1', -- UI color for role badges
    
    -- Role properties
    is_system_role BOOLEAN DEFAULT FALSE, -- Cannot be deleted
    is_assignable BOOLEAN DEFAULT TRUE,   -- Can be assigned to users
    max_users INTEGER, -- Limit number of users with this role
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL, -- e.g., 'users:read', 'reports:write'
    display_name TEXT NOT NULL,
    description TEXT,
    resource TEXT NOT NULL,    -- e.g., 'users', 'reports', 'system'
    action TEXT NOT NULL,      -- e.g., 'read', 'write', 'delete', 'admin'
    
    -- Permission properties
    is_system_permission BOOLEAN DEFAULT FALSE,
    conditions JSONB DEFAULT '[]'::jsonb, -- Advanced permission conditions
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role-Permission junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id),
    PRIMARY KEY (role_id, permission_id)
);

-- User-Role junction table  
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional role expiration
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

-- Direct user permissions (override/additional to role permissions)
CREATE TABLE IF NOT EXISTS public.user_permissions (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT TRUE, -- TRUE = grant, FALSE = revoke
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, permission_id)
);

-- Create indexes for roles and permissions
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_level ON public.roles(level);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON public.permissions(resource, action);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON public.user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);

-- =====================================================================
-- SESSION MANAGEMENT
-- =====================================================================

-- User sessions table (for enhanced session tracking)
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    refresh_token TEXT UNIQUE,
    
    -- Session info
    ip_address INET,
    user_agent TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    location_info JSONB DEFAULT '{}'::jsonb,
    
    -- Session status
    is_active BOOLEAN DEFAULT TRUE,
    is_trusted BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Security
    login_method TEXT DEFAULT 'email', -- email, oauth, mfa, etc.
    mfa_verified BOOLEAN DEFAULT FALSE
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.user_sessions(expires_at);

-- =====================================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER trigger_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create user profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger to auto-create profile
CREATE TRIGGER trigger_create_user_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update last_activity_at
CREATE OR REPLACE FUNCTION public.update_user_activity(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_profiles 
    SET last_activity_at = NOW()
    WHERE id = user_uuid;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- =====================================================================
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE public.user_profiles IS 'Extended user profile information';
COMMENT ON TABLE public.roles IS 'System roles for authorization';
COMMENT ON TABLE public.permissions IS 'Granular permissions for access control';
COMMENT ON TABLE public.role_permissions IS 'Junction table for role-permission assignments';
COMMENT ON TABLE public.user_roles IS 'Junction table for user-role assignments';
COMMENT ON TABLE public.user_permissions IS 'Direct user permission grants/revokes';
COMMENT ON TABLE public.user_sessions IS 'Enhanced session tracking and management';

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_initial_auth_schema completed successfully';
END $$;
