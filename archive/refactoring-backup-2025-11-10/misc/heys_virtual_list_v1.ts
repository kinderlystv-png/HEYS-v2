// heys_virtual_list_v1.ts — простая виртуализация длинных списков для React (TypeScript version)

import React from 'react';
import type { HEYSGlobal } from './types/heys';

// VirtualList component types
interface VirtualListItem {
  id?: string | number;
  [key: string]: any;
}

interface VirtualListProps {
  items: VirtualListItem[];
  itemHeight: number;
  height: number;
  renderItem: (item: VirtualListItem, index: number) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
    React: typeof React;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const React = global.React;

  // Virtual List Component
  const VirtualList: React.FC<VirtualListProps> = (props) => {
    const { items, itemHeight, height, renderItem, className, style } = props;
    const [scroll, setScroll] = React.useState(0);

    const total = (items || []).length;
    const visibleCount = Math.ceil(height / itemHeight) + 2; // +2 для плавности прокрутки
    const start = Math.max(0, Math.floor(scroll / itemHeight));
    const end = Math.min(total, start + visibleCount);
    const offsetY = start * itemHeight;

    const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScroll(target.scrollTop);
    }, []);

    // Оптимизация: мемоизация видимых элементов
    const visibleItems = React.useMemo(() => {
      return (items || []).slice(start, end);
    }, [items, start, end]);

    const containerStyle: React.CSSProperties = {
      overflowY: 'auto',
      height: height + 'px',
      position: 'relative',
      ...style,
    };

    const innerStyle: React.CSSProperties = {
      height: total * itemHeight + 'px',
      position: 'relative',
    };

    return React.createElement(
      'div',
      {
        className,
        style: containerStyle,
        onScroll,
      },
      React.createElement(
        'div',
        { style: innerStyle },
        visibleItems.map((item, i) => {
          const itemStyle: React.CSSProperties = {
            position: 'absolute',
            top: offsetY + i * itemHeight + 'px',
            left: 0,
            right: 0,
            height: itemHeight + 'px',
          };

          return React.createElement(
            'div',
            {
              key: item.id || start + i,
              style: itemStyle,
            },
            renderItem(item, start + i),
          );
        }),
      ),
    );
  };

  // Enhanced Virtual List with additional features
  interface EnhancedVirtualListProps extends VirtualListProps {
    overscan?: number; // Количество дополнительных элементов для рендера
    onScroll?: (scrollTop: number, scrollDirection: 'up' | 'down' | 'none') => void;
    loadMore?: () => void;
    hasMore?: boolean;
    loading?: boolean;
    loadingComponent?: React.ReactNode;
  }

  const EnhancedVirtualList: React.FC<EnhancedVirtualListProps> = (props) => {
    const {
      items,
      itemHeight,
      height,
      renderItem,
      overscan = 2,
      onScroll,
      loadMore,
      hasMore = false,
      loading = false,
      loadingComponent,
      ...restProps
    } = props;

    const [scroll, setScroll] = React.useState(0);
    const [lastScrollTop, setLastScrollTop] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const total = (items || []).length;
    const visibleCount = Math.ceil(height / itemHeight) + overscan;
    const start = Math.max(0, Math.floor(scroll / itemHeight) - Math.floor(overscan / 2));
    const end = Math.min(total, start + visibleCount);
    const offsetY = start * itemHeight;

    const handleScroll = React.useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        const scrollTop = target.scrollTop;
        const scrollDirection =
          scrollTop > lastScrollTop ? 'down' : scrollTop < lastScrollTop ? 'up' : 'none';

        setScroll(scrollTop);
        setLastScrollTop(scrollTop);

        if (onScroll) {
          onScroll(scrollTop, scrollDirection);
        }

        // Infinite loading
        if (loadMore && hasMore && !loading) {
          const scrollHeight = target.scrollHeight;
          const clientHeight = target.clientHeight;
          const threshold = 100; // 100px до конца

          if (scrollTop + clientHeight >= scrollHeight - threshold) {
            loadMore();
          }
        }
      },
      [lastScrollTop, onScroll, loadMore, hasMore, loading],
    );

    const visibleItems = React.useMemo(() => {
      return (items || []).slice(start, end);
    }, [items, start, end]);

    const containerStyle: React.CSSProperties = {
      overflowY: 'auto',
      height: height + 'px',
      position: 'relative',
      ...restProps.style,
    };

    const innerStyle: React.CSSProperties = {
      height: total * itemHeight + 'px',
      position: 'relative',
    };

    return React.createElement(
      'div',
      {
        ref: containerRef,
        className: restProps.className,
        style: containerStyle,
        onScroll: handleScroll,
      },
      React.createElement(
        'div',
        { style: innerStyle },
        visibleItems.map((item, i) => {
          const itemStyle: React.CSSProperties = {
            position: 'absolute',
            top: offsetY + i * itemHeight + 'px',
            left: 0,
            right: 0,
            height: itemHeight + 'px',
          };

          return React.createElement(
            'div',
            {
              key: item.id || start + i,
              style: itemStyle,
            },
            renderItem(item, start + i),
          );
        }),

        // Loading indicator
        loading &&
          loadingComponent &&
          React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: total * itemHeight + 'px',
                left: 0,
                right: 0,
                height: '50px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              },
            },
            loadingComponent,
          ),
      ),
    );
  };

  // Performance hooks for virtual list optimization
  const useVirtualListMetrics = (items: VirtualListItem[], itemHeight: number) => {
    const [metrics, setMetrics] = React.useState({
      totalHeight: 0,
      itemCount: 0,
      averageItemHeight: itemHeight,
      renderTime: 0,
    });

    React.useEffect(() => {
      const start = performance.now();

      setMetrics({
        totalHeight: items.length * itemHeight,
        itemCount: items.length,
        averageItemHeight: itemHeight,
        renderTime: performance.now() - start,
      });

      // Track performance if available
      if (window.HEYS && window.HEYS.performance) {
        window.HEYS.performance.timing('virtualList.update', performance.now() - start);
        window.HEYS.performance.increment('virtualList.renders');
      }
    }, [items.length, itemHeight]);

    return metrics;
  };

  // Utility function for dynamic item heights
  const createDynamicVirtualList = (
    heightEstimator: (item: VirtualListItem, index: number) => number,
  ) => {
    return React.forwardRef<HTMLDivElement, VirtualListProps>((props, ref) => {
      const { items, renderItem, height, ...restProps } = props;
      const [itemHeights, setItemHeights] = React.useState<number[]>([]);
      const [scroll, setScroll] = React.useState(0);

      // Calculate positions for dynamic heights
      const positions = React.useMemo(() => {
        const pos: Array<{ top: number; height: number }> = [];
        let top = 0;

        for (let i = 0; i < items.length; i++) {
          const itemHeight = itemHeights[i] || heightEstimator(items[i], i);
          pos[i] = { top, height: itemHeight };
          top += itemHeight;
        }

        return pos;
      }, [items, itemHeights, heightEstimator]);

      const totalHeight =
        positions.length > 0
          ? positions[positions.length - 1].top + positions[positions.length - 1].height
          : 0;

      // Find visible range for dynamic heights
      const findVisibleRange = () => {
        const containerTop = scroll;
        const containerBottom = scroll + height;

        let start = 0;
        let end = items.length;

        // Binary search for start
        let left = 0,
          right = items.length - 1;
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const pos = positions[mid];
          if (pos.top < containerTop) {
            start = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }

        // Linear search for end (from start)
        for (let i = start; i < items.length; i++) {
          if (positions[i].top > containerBottom) {
            end = i;
            break;
          }
        }

        return { start: Math.max(0, start - 1), end: Math.min(items.length, end + 1) };
      };

      const { start, end } = findVisibleRange();
      const visibleItems = items.slice(start, end);

      const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        setScroll(target.scrollTop);
      }, []);

      return React.createElement(
        'div',
        {
          ref,
          style: {
            overflowY: 'auto',
            height: height + 'px',
            position: 'relative',
            ...restProps.style,
          },
          onScroll: handleScroll,
        },
        React.createElement(
          'div',
          { style: { height: totalHeight + 'px', position: 'relative' } },
          visibleItems.map((item, i) => {
            const actualIndex = start + i;
            const pos = positions[actualIndex];

            return React.createElement(
              'div',
              {
                key: item.id || actualIndex,
                style: {
                  position: 'absolute',
                  top: pos.top + 'px',
                  left: 0,
                  right: 0,
                  height: pos.height + 'px',
                },
              },
              renderItem(item, actualIndex),
            );
          }),
        ),
      );
    });
  };

  // Assign to HEYS global
  HEYS.VirtualList = VirtualList;
  (HEYS as any).EnhancedVirtualList = EnhancedVirtualList;
  (HEYS as any).useVirtualListMetrics = useVirtualListMetrics;
  (HEYS as any).createDynamicVirtualList = createDynamicVirtualList;

  console.log('📋 HEYS Virtual List v1 (TypeScript) загружен');
})(window);
