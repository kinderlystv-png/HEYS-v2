// import { RouteComponents } from '../utils/lazy-loader';
import { Suspense } from 'react';
// import { PageSkeleton } from '../components/LoadingStates';

/**
 * Lazy-loaded route компоненты для оптимизации bundle
 * Route-based code splitting с intelligent preloading
 *
 * ПРИМЕЧАНИЕ: Эти импорты будут работать после создания соответствующих страниц
 * Сейчас они закомментированы для избежания ошибок компиляции
 */

/*
// Main Dashboard Routes
export const Dashboard = RouteComponents.createLazyRoute(
  () => import('../pages/Dashboard'),
  'dashboard'
);

export const Analytics = RouteComponents.createLazyRoute(
  () => import('../pages/Analytics'),
  'analytics'
);

// User Management Routes
export const UserProfile = RouteComponents.createLazyRoute(
  () => import('../pages/UserProfile'),
  'user-profile'
);

export const UserSettings = RouteComponents.createLazyRoute(
  () => import('../pages/UserSettings'),
  'user-settings'
);

// Gaming Routes
export const GameHub = RouteComponents.createLazyRoute(
  () => import('../pages/Gaming/GameHub'),
  'game-hub'
);

export const GameDetail = RouteComponents.createLazyRoute(
  () => import('../pages/Gaming/GameDetail'),
  'game-detail'
);

// Search Routes
export const SearchPage = RouteComponents.createLazyRoute(
  () => import('../pages/Search'),
  'search'
);

export const SearchResults = RouteComponents.createLazyRoute(
  () => import('../pages/SearchResults'),
  'search-results'
);

// Storage & Files Routes
export const FileManager = RouteComponents.createLazyRoute(
  () => import('../pages/Storage/FileManager'),
  'file-manager'
);

export const StorageAnalytics = RouteComponents.createLazyRoute(
  () => import('../pages/Storage/Analytics'),
  'storage-analytics'
);

// Threat Detection Routes
export const ThreatDashboard = RouteComponents.createLazyRoute(
  () => import('../pages/ThreatDetection/Dashboard'),
  'threat-dashboard'
);

export const ThreatDetails = RouteComponents.createLazyRoute(
  () => import('../pages/ThreatDetection/Details'),
  'threat-details'
);
*/

/**
 * Route wrapper с loading states и error boundaries
 */
interface LazyRouteWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  skeletonType?: 'dashboard' | 'list' | 'detail' | 'form' | 'analytics';
}

export function LazyRouteWrapper({
  children,
  fallback,
  skeletonType = 'dashboard',
}: LazyRouteWrapperProps) {
  // const defaultFallback = <PageSkeleton type={skeletonType} />;
  const defaultFallback = <div>Loading {skeletonType}...</div>;

  return <Suspense fallback={fallback || defaultFallback}>{children}</Suspense>;
}

/*
Пример использования LazyRoutes:

import { RouteComponents } from '../utils/lazy-loader';
import { PageSkeleton } from '../components/LoadingStates';

// После создания страниц, активируйте эти маршруты:

const Dashboard = RouteComponents.createLazyRoute(
  () => import('../pages/Dashboard'),
  'dashboard'
);

const Analytics = RouteComponents.createLazyRoute(
  () => import('../pages/Analytics'),
  'analytics'
);

export const LazyRoutes = {
  '/dashboard': {
    component: Dashboard,
    preloadProps: RouteComponents.preloadOnHover('dashboard'),
    skeleton: 'dashboard'
  },
  '/analytics': {
    component: Analytics,
    preloadProps: RouteComponents.preloadOnHover('analytics'),
    skeleton: 'analytics'
  }
};

// Navigation Links с preloading:
export const NavLinks = {
  Dashboard: (props: any) => (
    <a {...props} {...RouteComponents.preloadOnHover('dashboard')}>
      Dashboard
    </a>
  ),
  
  Analytics: (props: any) => (
    <a {...props} {...RouteComponents.preloadOnHover('analytics')}>
      Analytics
    </a>
  )
};
*/

export default LazyRouteWrapper;
