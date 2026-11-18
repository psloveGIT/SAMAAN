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

  const [topFillerWidth, setTopFillerWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const rafRef = useRef<number | null>(null);
  const overflowRef = useRef(false);
  const flipCountRef = useRef<{ ts: number; count: number }>({ ts: 0, count: 0 });

  const measure = useCallback(() => {
    const body = bodyScrollRef.current;
    if (!body) return;
    const sw = body.scrollWidth;
    const cw = body.clientWidth;
    const diff = sw - cw;
    const prevOverflow = overflowRef.current;
    const rawNextOverflow = prevOverflow ? diff > 1 : diff > 4;

    let nextOverflow = rawNextOverflow;
    if (rawNextOverflow !== prevOverflow) {
      const now = performance.now();
      if (now - flipCountRef.current.ts < 300) {
        flipCountRef.current.count += 1;
        if (flipCountRef.current.count > 4) {
          // Lock into stable overflow state to break any layout/scrollbar threshold oscillation
          nextOverflow = true;
        }
      } else {
        flipCountRef.current = { ts: now, count: 1 };
      }
      overflowRef.current = nextOverflow;
      setHasHorizontalOverflow(nextOverflow);
    }

    const top = topBarRef.current;
    const nextFiller = top ? Math.max(sw, top.clientWidth + Math.max(0, diff)) : sw;
    setTopFillerWidth((prev) => (prev !== nextFiller ? nextFiller : prev));
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const body = bodyScrollRef.current;
    if (!body) return;

    scheduleMeasure();

    let observedChild = body.firstElementChild;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleMeasure()) : null;
    resizeObserver?.observe(body);
    if (observedChild) {
      resizeObserver?.observe(observedChild);
    }

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            const nextChild = body.firstElementChild;
            if (nextChild !== observedChild) {
              if (observedChild) resizeObserver?.unobserve(observedChild);
              observedChild = nextChild;
              if (observedChild) resizeObserver?.observe(observedChild);
            }
            scheduleMeasure();
          })
        : null;
    mutationObserver?.observe(body, { childList: true, subtree: false });

    window.addEventListener('resize', scheduleMeasure);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [scheduleMeasure]);

  // Keep top scrollbar initially aligned with body scroll position and exact max scroll width
  useEffect(() => {
    if (!hasHorizontalOverflow) return;
    const top = topBarRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    const exactFiller = Math.max(body.scrollWidth, top.clientWidth + Math.max(0, body.scrollWidth - body.clientWidth));
    if (exactFiller !== topFillerWidth) {
      setTopFillerWidth(exactFiller);
    }
    if (Math.abs(top.scrollLeft - body.scrollLeft) >= 1) {
      activeLockRef.current = { source: 'body', until: performance.now() + 80 };
      top.scrollLeft = body.scrollLeft;
    }
  }, [hasHorizontalOverflow, topFillerWidth]);

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
          <div style={{ width: `${topFillerWidth}px`, height: '1px' }} />
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
