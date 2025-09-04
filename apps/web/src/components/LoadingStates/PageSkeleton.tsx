// filepath: apps/web/src/components/LoadingStates/PageSkeleton.tsx
/**
 * Page Skeleton Component
 * Performance Sprint Day 3 - Component 2A
 * Provides skeleton loading states for full pages
 */

interface PageSkeletonProps {
  /** Тип страницы для разного skeleton */
  type?: 'dashboard' | 'list' | 'detail' | 'form' | 'analytics';
  /** Показывать ли header skeleton */
  showHeader?: boolean;
  /** Показывать ли sidebar skeleton */
  showSidebar?: boolean;
  /** Дополнительные CSS классы */
  className?: string;
  /** Количество элементов списка (для type='list') */
  listItems?: number;
}

// Базовые стили для skeleton анимации
const skeletonBaseClass = `
  animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 
  bg-[length:200%_100%] rounded-md
`;

export function PageSkeleton({ 
  type = 'dashboard',
  showHeader = true,
  showSidebar = false,
  className = '',
  listItems = 5
}: PageSkeletonProps) {
  
  const renderHeader = () => {
    if (!showHeader) return null;
    
    return (
      <header className="mb-6">
        <div className={`h-8 w-64 ${skeletonBaseClass} mb-2`} />
        <div className={`h-4 w-96 ${skeletonBaseClass}`} />
      </header>
    );
  };
  
  const renderSidebar = () => {
    if (!showSidebar) return null;
    
    return (
      <aside className="w-64 mr-6">
        <div className={`h-6 w-32 ${skeletonBaseClass} mb-4`} />
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`h-4 w-full ${skeletonBaseClass} mb-2`} />
        ))}
      </aside>
    );
  };
  
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-4 border rounded-lg">
            <div className={`h-4 w-20 ${skeletonBaseClass} mb-2`} />
            <div className={`h-8 w-16 ${skeletonBaseClass} mb-1`} />
            <div className={`h-3 w-24 ${skeletonBaseClass}`} />
          </div>
        ))}
      </div>
      
      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg">
          <div className={`h-5 w-32 ${skeletonBaseClass} mb-4`} />
          <div className={`h-64 w-full ${skeletonBaseClass}`} />
        </div>
        <div className="p-4 border rounded-lg">
          <div className={`h-5 w-28 ${skeletonBaseClass} mb-4`} />
          <div className={`h-64 w-full ${skeletonBaseClass}`} />
        </div>
      </div>
      
      {/* Table Area */}
      <div className="p-4 border rounded-lg">
        <div className={`h-5 w-40 ${skeletonBaseClass} mb-4`} />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4">
              <div className={`h-4 ${skeletonBaseClass}`} />
              <div className={`h-4 ${skeletonBaseClass}`} />
              <div className={`h-4 ${skeletonBaseClass}`} />
              <div className={`h-4 w-20 ${skeletonBaseClass}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  
  const renderList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className={`h-6 w-48 ${skeletonBaseClass}`} />
        <div className={`h-10 w-32 ${skeletonBaseClass}`} />
      </div>
      
      <div className="space-y-3">
        {[...Array(listItems)].map((_, i) => (
          <div key={i} className="flex items-center p-4 border rounded-lg">
            <div className={`h-12 w-12 rounded-full ${skeletonBaseClass} mr-4`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-3/4 ${skeletonBaseClass}`} />
              <div className={`h-3 w-1/2 ${skeletonBaseClass}`} />
            </div>
            <div className={`h-8 w-20 ${skeletonBaseClass}`} />
          </div>
        ))}
      </div>
    </div>
  );
  
  const renderDetail = () => (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className={`h-8 w-2/3 ${skeletonBaseClass}`} />
        <div className={`h-4 w-full ${skeletonBaseClass}`} />
        <div className={`h-4 w-5/6 ${skeletonBaseClass}`} />
      </div>
      
      {/* Image/Media */}
      <div className={`h-64 w-full ${skeletonBaseClass}`} />
      
      {/* Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className={`h-5 w-40 ${skeletonBaseClass}`} />
              <div className={`h-4 w-full ${skeletonBaseClass}`} />
              <div className={`h-4 w-4/5 ${skeletonBaseClass}`} />
              <div className={`h-4 w-3/4 ${skeletonBaseClass}`} />
            </div>
          ))}
        </div>
        
        <div className="space-y-4">
          <div className={`h-5 w-32 ${skeletonBaseClass}`} />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-4 w-full ${skeletonBaseClass}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderForm = () => (
    <div className="max-w-2xl space-y-6">
      <div className={`h-6 w-48 ${skeletonBaseClass} mb-6`} />
      
      {[...Array(6)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className={`h-4 w-32 ${skeletonBaseClass}`} />
          <div className={`h-10 w-full ${skeletonBaseClass}`} />
        </div>
      ))}
      
      <div className="flex space-x-4 pt-4">
        <div className={`h-10 w-24 ${skeletonBaseClass}`} />
        <div className={`h-10 w-24 ${skeletonBaseClass}`} />
      </div>
    </div>
  );
  
  const renderAnalytics = () => (
    <div className="space-y-6">
      {/* Date Range Picker */}
      <div className="flex justify-between items-center">
        <div className={`h-6 w-40 ${skeletonBaseClass}`} />
        <div className={`h-10 w-64 ${skeletonBaseClass}`} />
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="text-center p-4 border rounded-lg">
            <div className={`h-8 w-16 ${skeletonBaseClass} mx-auto mb-2`} />
            <div className={`h-4 w-20 ${skeletonBaseClass} mx-auto`} />
          </div>
        ))}
      </div>
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 border rounded-lg">
            <div className={`h-5 w-32 ${skeletonBaseClass} mb-4`} />
            <div className={`h-48 w-full ${skeletonBaseClass}`} />
          </div>
        ))}
      </div>
      
      {/* Data Table */}
      <div className="p-4 border rounded-lg">
        <div className={`h-5 w-40 ${skeletonBaseClass} mb-4`} />
        <div className="overflow-hidden">
          <div className="grid grid-cols-5 gap-4 mb-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-4 ${skeletonBaseClass}`} />
            ))}
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 mb-2">
              {[...Array(5)].map((_, j) => (
                <div key={j} className={`h-4 ${skeletonBaseClass}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  
  const renderContent = () => {
    switch (type) {
      case 'dashboard': return renderDashboard();
      case 'list': return renderList();
      case 'detail': return renderDetail();
      case 'form': return renderForm();
      case 'analytics': return renderAnalytics();
      default: return renderDashboard();
    }
  };
  
  return (
    <div className={`page-skeleton ${className}`} data-testid="page-skeleton">
      <style>{`
        .page-skeleton .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
      
      <div className="flex">
        {renderSidebar()}
        <main className="flex-1">
          {renderHeader()}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default PageSkeleton;
