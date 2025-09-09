-- filepath: packages/auth/database/seeds/002_default_roles_permissions.sql

-- =====================================================================
-- HEYS EAP 3.0 - Default Roles and Permissions Seed Data
-- Seed: 002_default_roles_permissions
-- Description: Insert default system roles and permissions
-- =====================================================================

-- =====================================================================
-- DEFAULT PERMISSIONS
-- =====================================================================

-- User Management Permissions
INSERT INTO public.permissions (name, display_name, description, resource, action, is_system_permission) VALUES
('users:read', 'View Users', 'Can view user profiles and basic information', 'users', 'read', true),
('users:write', 'Manage Users', 'Can create, update, and manage user accounts', 'users', 'write', true),
('users:delete', 'Delete Users', 'Can delete user accounts', 'users', 'delete', true),
('users:admin', 'User Administration', 'Full administrative access to user management', 'users', 'admin', true),

-- Role Management Permissions  
('roles:read', 'View Roles', 'Can view roles and their permissions', 'roles', 'read', true),
('roles:write', 'Manage Roles', 'Can create and modify roles', 'roles', 'write', true),
('roles:assign', 'Assign Roles', 'Can assign roles to users', 'roles', 'assign', true),
('roles:admin', 'Role Administration', 'Full administrative access to role management', 'roles', 'admin', true),

-- Content Management Permissions
('content:read', 'View Content', 'Can view content and posts', 'content', 'read', true),
('content:write', 'Create Content', 'Can create and edit content', 'content', 'write', true),
('content:publish', 'Publish Content', 'Can publish and unpublish content', 'content', 'publish', true),
('content:delete', 'Delete Content', 'Can delete content', 'content', 'delete', true),
('content:moderate', 'Moderate Content', 'Can moderate and review content', 'content', 'moderate', true),

-- Reports and Analytics Permissions
('reports:read', 'View Reports', 'Can view reports and analytics', 'reports', 'read', true),
('reports:write', 'Create Reports', 'Can create custom reports', 'reports', 'write', true),
('reports:export', 'Export Reports', 'Can export reports and data', 'reports', 'export', true),
('reports:admin', 'Report Administration', 'Full access to reporting system', 'reports', 'admin', true),

-- Dashboard and Analytics Permissions
('dashboard:read', 'View Dashboard', 'Can access dashboard and widgets', 'dashboard', 'read', true),
('dashboard:customize', 'Customize Dashboard', 'Can customize dashboard layout and widgets', 'dashboard', 'customize', true),
('dashboard:admin', 'Dashboard Administration', 'Can manage dashboard configurations', 'dashboard', 'admin', true),

-- System Administration Permissions
('system:read', 'System Information', 'Can view system information and status', 'system', 'read', true),
('system:configure', 'System Configuration', 'Can modify system settings', 'system', 'configure', true),
('system:backup', 'System Backup', 'Can create and restore system backups', 'system', 'backup', true),
('system:admin', 'System Administration', 'Full system administrative access', 'system', 'admin', true),

-- Audit and Logging Permissions
('audit:read', 'View Audit Logs', 'Can view audit logs and user activity', 'audit', 'read', true),
('audit:export', 'Export Audit Data', 'Can export audit logs and reports', 'audit', 'export', true),
('audit:admin', 'Audit Administration', 'Full access to audit system', 'audit', 'admin', true),

-- API and Integration Permissions
('api:read', 'API Read Access', 'Can access read-only API endpoints', 'api', 'read', true),
('api:write', 'API Write Access', 'Can access write API endpoints', 'api', 'write', true),
('api:admin', 'API Administration', 'Can manage API keys and integrations', 'api', 'admin', true)

ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- DEFAULT ROLES
-- =====================================================================

-- Insert default system roles
INSERT INTO public.roles (name, display_name, description, level, color, is_system_role, is_assignable) VALUES
-- Basic User Roles
('guest', 'Guest', 'Limited access for unregistered or new users', 0, '#9ca3af', true, false),
('user', 'User', 'Standard user with basic access permissions', 10, '#3b82f6', true, true),
('verified_user', 'Verified User', 'Verified user with enhanced access', 20, '#059669', true, true),

-- Content Management Roles
('content_creator', 'Content Creator', 'Can create and manage own content', 30, '#8b5cf6', true, true),
('content_editor', 'Content Editor', 'Can edit and review content from others', 40, '#7c3aed', true, true),
('content_moderator', 'Content Moderator', 'Can moderate and approve content', 50, '#c026d3', true, true),

-- Administrative Roles
('support', 'Support Agent', 'Customer support and user assistance', 60, '#f59e0b', true, true),
('manager', 'Manager', 'Department or team management access', 70, '#ea580c', true, true),
('admin', 'Administrator', 'System administration with elevated privileges', 80, '#dc2626', true, true),
('super_admin', 'Super Administrator', 'Full system access and control', 90, '#991b1b', true, true),

-- Special Purpose Roles
('api_user', 'API User', 'Programmatic access via API', 25, '#06b6d4', true, true),
('auditor', 'Auditor', 'Read-only access for auditing and compliance', 35, '#64748b', true, true),
('developer', 'Developer', 'Development and testing access', 45, '#10b981', true, true)

ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- ROLE-PERMISSION ASSIGNMENTS
-- =====================================================================

-- Guest Role (minimal permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'guest' AND p.name IN (
    'content:read'
) ON CONFLICT DO NOTHING;

-- User Role (basic user permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'user' AND p.name IN (
    'content:read',
    'dashboard:read',
    'users:read'
) ON CONFLICT DO NOTHING;

-- Verified User Role (enhanced user permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'verified_user' AND p.name IN (
    'content:read',
    'content:write',
    'dashboard:read',
    'dashboard:customize',
    'users:read',
    'reports:read'
) ON CONFLICT DO NOTHING;

-- Content Creator Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'content_creator' AND p.name IN (
    'content:read',
    'content:write',
    'content:publish',
    'dashboard:read',
    'dashboard:customize',
    'users:read',
    'reports:read'
) ON CONFLICT DO NOTHING;

-- Content Editor Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'content_editor' AND p.name IN (
    'content:read',
    'content:write',
    'content:publish',
    'content:moderate',
    'dashboard:read',
    'dashboard:customize',
    'users:read',
    'reports:read',
    'reports:write'
) ON CONFLICT DO NOTHING;

-- Content Moderator Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'content_moderator' AND p.name IN (
    'content:read',
    'content:write',
    'content:publish',
    'content:moderate',
    'content:delete',
    'dashboard:read',
    'dashboard:customize',
    'users:read',
    'reports:read',
    'reports:write',
    'audit:read'
) ON CONFLICT DO NOTHING;

-- Support Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'support' AND p.name IN (
    'users:read',
    'users:write',
    'content:read',
    'content:moderate',
    'dashboard:read',
    'reports:read',
    'audit:read'
) ON CONFLICT DO NOTHING;

-- Manager Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'manager' AND p.name IN (
    'users:read',
    'users:write',
    'roles:read',
    'roles:assign',
    'content:read',
    'content:write',
    'content:publish',
    'content:moderate',
    'content:delete',
    'dashboard:read',
    'dashboard:customize',
    'dashboard:admin',
    'reports:read',
    'reports:write',
    'reports:export',
    'audit:read',
    'audit:export'
) ON CONFLICT DO NOTHING;

-- Admin Role (high-level administrative access)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'admin' AND p.name IN (
    'users:read',
    'users:write',
    'users:delete',
    'users:admin',
    'roles:read',
    'roles:write',
    'roles:assign',
    'roles:admin',
    'content:read',
    'content:write',
    'content:publish',
    'content:moderate',
    'content:delete',
    'dashboard:read',
    'dashboard:customize',
    'dashboard:admin',
    'reports:read',
    'reports:write',
    'reports:export',
    'reports:admin',
    'system:read',
    'system:configure',
    'audit:read',
    'audit:export',
    'audit:admin',
    'api:read',
    'api:write'
) ON CONFLICT DO NOTHING;

-- Super Admin Role (full system access)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'super_admin' AND p.name LIKE '%:%'
ON CONFLICT DO NOTHING;

-- API User Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'api_user' AND p.name IN (
    'api:read',
    'api:write',
    'content:read',
    'users:read',
    'reports:read'
) ON CONFLICT DO NOTHING;

-- Auditor Role (read-only access for compliance)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'auditor' AND p.name IN (
    'users:read',
    'roles:read',
    'content:read',
    'dashboard:read',
    'reports:read',
    'reports:export',
    'audit:read',
    'audit:export',
    'system:read'
) ON CONFLICT DO NOTHING;

-- Developer Role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'developer' AND p.name IN (
    'api:read',
    'api:write',
    'api:admin',
    'system:read',
    'audit:read',
    'reports:read',
    'dashboard:read'
) ON CONFLICT DO NOTHING;

-- =====================================================================
-- DEFAULT USER ASSIGNMENTS (for testing/development)
-- =====================================================================

-- Note: In production, user-role assignments should be done through the application
-- This section can be used for initial testing or default admin setup

-- Example: Assign super_admin role to first user (uncomment and modify as needed)
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT u.id, r.id FROM auth.users u, public.roles r 
-- WHERE u.email = 'admin@heys.example.com' AND r.name = 'super_admin'
-- ON CONFLICT DO NOTHING;

-- =====================================================================
-- LOGGING AND VERIFICATION
-- =====================================================================

-- Count and display seeded data
DO $$
DECLARE
    perm_count INTEGER;
    role_count INTEGER;
    assignment_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO perm_count FROM public.permissions;
    SELECT COUNT(*) INTO role_count FROM public.roles;
    SELECT COUNT(*) INTO assignment_count FROM public.role_permissions;
    
    RAISE NOTICE 'Seed data completed:';
    RAISE NOTICE '- Permissions created: %', perm_count;
    RAISE NOTICE '- Roles created: %', role_count;
    RAISE NOTICE '- Role-permission assignments: %', assignment_count;
END $$;

-- =====================================================================
-- SEED COMPLETE
-- =====================================================================
