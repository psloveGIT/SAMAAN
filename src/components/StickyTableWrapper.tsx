import React, { useCallback, useEffect, useRef, useState } from 'react';

interface StickyTableWrapperProps {
  children: React.ReactNode;
  className?: string;
  maxHeightClassName?: string;
  maxHeightClass?: string;
}

/**
 * Wraps any data table with:
 * 1. Bounded vertical scroll (`max-h-[70vh]`) + sticky opaque `thead` (`samaan-table-scroll`)
 *    so column headers remain pinned while scrolling down rows.
 * 2. A synced top horizontal scrollbar automatically displayed whenever the table is wider
 *    than its container, so horizontal scrolling is always accessible without scrolling down.
 */
export const StickyTableWrapper: React.FC<StickyTableWrapperProps> = ({
  children,
  className = '',
  maxHeightClassName,
  maxHeightClass,
}) => {
  const effectiveMaxHeight = maxHeightClass ?? maxHeightClassName ?? 'max-h-[70vh]';
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<'top' | 'body' | null>(null);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const measure = useCallback(() => {
    const body = bodyScrollRef.current;
    if (!body) return;
    const sw = body.scrollWidth;
    const cw = body.clientWidth;
    setScrollWidth(sw);
    setHasHorizontalOverflow(sw - cw > 2);
  }, []);

  useEffect(() => {
    const body = bodyScrollRef.current;
    if (!body) return;

    measure();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    resizeObserver?.observe(body);
    if (body.firstElementChild) {
      resizeObserver?.observe(body.firstElementChild);
    }

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            requestAnimationFrame(measure);
          })
        : null;
    mutationObserver?.observe(body, { childList: true, subtree: true, attributes: true });

    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  const handleTopScroll = () => {
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    if (syncingRef.current === 'body') {
      syncingRef.current = null;
      return;
    }
    syncingRef.current = 'top';
    body.scrollLeft = top.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingRef.current === 'top') syncingRef.current = null;
    });
  };

  const handleBodyScroll = () => {
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    if (syncingRef.current === 'top') {
      syncingRef.current = null;
      return;
    }
    syncingRef.current = 'body';
    top.scrollLeft = body.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingRef.current === 'body') syncingRef.current = null;
    });
  };

  return (
    <div className={`w-full ${className}`}>
      {hasHorizontalOverflow && (
        <div
          ref={topBarRef}
          onScroll={handleTopScroll}
          className="samaan-top-scrollbar overflow-x-auto overflow-y-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 print:hidden"
          aria-hidden="true"
        >
          <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
        </div>
      )}
      <div
        ref={bodyScrollRef}
        onScroll={handleBodyScroll}
        className={`samaan-table-scroll overflow-auto ${effectiveMaxHeight} print:max-h-none print:overflow-visible`}
      >
        {children}
      </div>
    </div>
  );
};
