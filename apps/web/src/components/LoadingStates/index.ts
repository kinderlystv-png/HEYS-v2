import { ComponentSkeleton, SkeletonVariants } from './ComponentSkeleton';
import { PageSkeleton } from './PageSkeleton';

export { ComponentSkeleton, SkeletonVariants } from './ComponentSkeleton';
export { PageSkeleton } from './PageSkeleton';

/**
 * Centralized loading states management
 *
 * Usage:
 * import { PageSkeleton, ComponentSkeleton, SkeletonVariants } from '@/components/LoadingStates';
 *
 * Examples:
 * - <PageSkeleton type="dashboard" />
 * - <ComponentSkeleton type="card" variant="detailed" />
 * - <SkeletonVariants.UserProfile />
 */

export const LoadingStates = {
  Page: PageSkeleton,
  Component: ComponentSkeleton,
  Variants: SkeletonVariants,
};

export default LoadingStates;
