-- filepath: packages/auth/database/policies/003_rls_policies.sql

-- =====================================================================
-- HEYS EAP 3.0 - Row Level Security (RLS) Policies
-- Policy: 003_rls_policies
-- Description: Implement comprehensive RLS for data security
-- =====================================================================

-- =====================================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================================

-- Function to get current user's roles
CREATE OR REPLACE FUNCTION public.get_user_roles(user_uuid UUID DEFAULT auth.uid())
RETURNS TEXT[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT r.name 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = user_uuid 
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name TEXT, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Check direct user permissions first
    IF EXISTS (
        SELECT 1 FROM public.user_permissions up
        JOIN public.permissions p ON up.permission_id = p.id
        WHERE up.user_id = user_uuid 
          AND p.name = permission_name
          AND up.granted = true
          AND (up.expires_at IS NULL OR up.expires_at > NOW())
    ) THEN
        RETURN true;
    END IF;

    -- Check if any user role has the permission
    IF EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.role_permissions rp ON ur.role_id = rp.role_id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = user_uuid 
          AND p.name = permission_name
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.user_has_role(role_names TEXT[], user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = user_uuid 
          AND r.name = ANY(role_names)
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin (has admin or super_admin role)
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.user_has_role(ARRAY['admin', 'super_admin'], user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- USER PROFILES POLICIES
-- =====================================================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (
        auth.uid() = id
    );

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (
        auth.uid() = id
    ) WITH CHECK (
        auth.uid() = id
        -- Prevent users from changing critical fields
        AND (OLD.status = NEW.status OR public.is_admin())
        AND (OLD.security_level = NEW.security_level OR public.is_admin())
    );

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        public.user_has_permission('users:read')
    );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON public.user_profiles
    FOR UPDATE USING (
        public.user_has_permission('users:write')
    );

-- Admins can insert profiles (for user creation)
CREATE POLICY "Admins can create profiles" ON public.user_profiles
    FOR INSERT WITH CHECK (
        public.user_has_permission('users:write')
    );

-- Only super admins can delete profiles
CREATE POLICY "Super admins can delete profiles" ON public.user_profiles
    FOR DELETE USING (
        public.user_has_permission('users:delete')
    );

-- =====================================================================
-- ROLES POLICIES
-- =====================================================================

-- Users with roles:read permission can view roles
CREATE POLICY "View roles with permission" ON public.roles
    FOR SELECT USING (
        public.user_has_permission('roles:read')
    );

-- Users with roles:write permission can manage roles
CREATE POLICY "Manage roles with permission" ON public.roles
    FOR ALL USING (
        public.user_has_permission('roles:write')
    ) WITH CHECK (
        public.user_has_permission('roles:write')
        -- Prevent modification of system roles unless super admin
        AND (NOT is_system_role OR public.user_has_role(ARRAY['super_admin']))
    );

-- =====================================================================
-- PERMISSIONS POLICIES
-- =====================================================================

-- Users with roles:read can view permissions
CREATE POLICY "View permissions with role read" ON public.permissions
    FOR SELECT USING (
        public.user_has_permission('roles:read')
    );

-- Only admins can modify permissions
CREATE POLICY "Admins manage permissions" ON public.permissions
    FOR ALL USING (
        public.user_has_permission('roles:admin')
    ) WITH CHECK (
        public.user_has_permission('roles:admin')
        -- System permissions can only be modified by super admin
        AND (NOT is_system_permission OR public.user_has_role(ARRAY['super_admin']))
    );

-- =====================================================================
-- ROLE PERMISSIONS POLICIES
-- =====================================================================

-- Users with roles:read can view role-permission mappings
CREATE POLICY "View role permissions" ON public.role_permissions
    FOR SELECT USING (
        public.user_has_permission('roles:read')
    );

-- Users with roles:write can manage role-permission mappings
CREATE POLICY "Manage role permissions" ON public.role_permissions
    FOR ALL USING (
        public.user_has_permission('roles:write')
    );

-- =====================================================================
-- USER ROLES POLICIES
-- =====================================================================

-- Users can see their own role assignments
CREATE POLICY "Users see own roles" ON public.user_roles
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.user_has_permission('users:read')
    );

-- Only users with role assignment permission can manage user roles
CREATE POLICY "Manage user role assignments" ON public.user_roles
    FOR ALL USING (
        public.user_has_permission('roles:assign')
    ) WITH CHECK (
        public.user_has_permission('roles:assign')
    );

-- =====================================================================
-- USER PERMISSIONS POLICIES
-- =====================================================================

-- Users can see their own direct permissions
CREATE POLICY "Users see own permissions" ON public.user_permissions
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.user_has_permission('users:read')
    );

-- Only admins can manage direct user permissions
CREATE POLICY "Admins manage user permissions" ON public.user_permissions
    FOR ALL USING (
        public.user_has_permission('users:admin')
    );

-- =====================================================================
-- USER SESSIONS POLICIES
-- =====================================================================

-- Users can only see their own sessions
CREATE POLICY "Users see own sessions" ON public.user_sessions
    FOR SELECT USING (
        auth.uid() = user_id
    );

-- Users can update their own sessions (for activity tracking)
CREATE POLICY "Users update own sessions" ON public.user_sessions
    FOR UPDATE USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id
    );

-- System can insert sessions (for login tracking)
CREATE POLICY "System creates sessions" ON public.user_sessions
    FOR INSERT WITH CHECK (
        true -- Allow session creation, will be restricted by application logic
    );

-- Users can delete their own sessions (logout)
CREATE POLICY "Users delete own sessions" ON public.user_sessions
    FOR DELETE USING (
        auth.uid() = user_id
    );

-- Admins can view all sessions for security monitoring
CREATE POLICY "Admins view all sessions" ON public.user_sessions
    FOR SELECT USING (
        public.user_has_permission('audit:read')
    );

-- =====================================================================
-- ADDITIONAL SECURITY FUNCTIONS
-- =====================================================================

-- Function to check if user can access resource based on conditions
CREATE OR REPLACE FUNCTION public.check_resource_access(
    resource_name TEXT,
    action_name TEXT,
    resource_id UUID DEFAULT NULL,
    user_uuid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
    permission_name TEXT;
    has_access BOOLEAN DEFAULT FALSE;
BEGIN
    permission_name := resource_name || ':' || action_name;
    
    -- Check if user has the basic permission
    has_access := public.user_has_permission(permission_name, user_uuid);
    
    -- Additional resource-specific checks can be added here
    -- For example, checking if user owns the resource
    
    RETURN has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log permission checks (for auditing)
CREATE OR REPLACE FUNCTION public.log_permission_check(
    user_uuid UUID,
    permission_name TEXT,
    granted BOOLEAN,
    resource_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- This could insert into an audit table
    -- For now, just raise a notice for debugging
    IF NOT granted THEN
        RAISE DEBUG 'Permission denied: User % requested % for resource %', user_uuid, permission_name, resource_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS TO AUTHENTICATED USERS
-- =====================================================================

-- Grant execute permissions on RLS helper functions
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(TEXT[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_resource_access(TEXT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_permission_check(UUID, TEXT, BOOLEAN, UUID) TO authenticated;

-- Grant select permissions on lookup tables for authenticated users
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;

-- =====================================================================
-- LOGGING AND VERIFICATION
-- =====================================================================

DO $$
DECLARE
    policy_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count policies created
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE schemaname = 'public';
    
    -- Count functions created
    SELECT COUNT(*) INTO function_count 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname LIKE '%user_%' OR p.proname LIKE '%permission%' OR p.proname LIKE '%role%';
    
    RAISE NOTICE 'RLS Policies implemented:';
    RAISE NOTICE '- Total policies created: %', policy_count;
    RAISE NOTICE '- Helper functions created: %', function_count;
    RAISE NOTICE 'Row Level Security is now active for all tables';
END $$;

-- =====================================================================
-- RLS POLICIES COMPLETE
-- =====================================================================
