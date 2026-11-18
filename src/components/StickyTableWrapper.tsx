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
 *    than its container (with bottom horizontal scrollbar hidden cleanly via CSS),
 *    using a jitter-free RTL-safe bidirectional lock.
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
  const activeLockRef = useRef<{ source: 'top' | 'body'; until: number } | null>(null);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const measure = useCallback(() => {
    const body = bodyScrollRef.current;
    if (!body) return;
    const sw = body.scrollWidth;
    const cw = body.clientWidth;
    const nextOverflow = sw - cw > 2;
    setScrollWidth((prev) => (prev !== sw ? sw : prev));
    setHasHorizontalOverflow((prev) => (prev !== nextOverflow ? nextOverflow : prev));
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
    mutationObserver?.observe(body, { childList: true, subtree: false });

    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  // Keep top scrollbar initially aligned with body scroll position when mounted
  useEffect(() => {
    if (!hasHorizontalOverflow) return;
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    if (Math.abs(top.scrollLeft - body.scrollLeft) >= 1) {
      activeLockRef.current = { source: 'body', until: performance.now() + 80 };
      top.scrollLeft = body.scrollLeft;
    }
  }, [hasHorizontalOverflow, scrollWidth]);

  const handleTopScroll = () => {
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    const now = performance.now();
    const lock = activeLockRef.current;
    if (lock && lock.source === 'body' && now < lock.until) {
      return;
    }
    const next = top.scrollLeft;
    if (Math.abs(body.scrollLeft - next) < 1) return;
    activeLockRef.current = { source: 'top', until: now + 90 };
    body.scrollLeft = next;
  };

  const handleBodyScroll = () => {
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    const now = performance.now();
    const lock = activeLockRef.current;
    if (lock && lock.source === 'top' && now < lock.until) {
      return;
    }
    const next = body.scrollLeft;
    if (Math.abs(top.scrollLeft - next) < 1) return;
    activeLockRef.current = { source: 'body', until: now + 90 };
    top.scrollLeft = next;
  };

  return (
    <div className={`w-full min-w-0 ${className}`}>
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
        className={`samaan-table-scroll overflow-y-auto overflow-x-auto ${effectiveMaxHeight} print:max-h-none print:overflow-visible`}
      >
        {children}
      </div>
    </div>
  );
};
