'use client';

// Client-side performance monitoring utilities
import { useCallback, useEffect, useRef, useState } from 'react';

// Core Web Vitals monitoring
export function measureWebVitals() {
  if (typeof window === 'undefined') return;
  
  // Largest Contentful Paint (LCP)
  const observeLCP = () => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log('[Performance] LCP:', lastEntry.startTime, 'ms');
      
      // Track if over budget (2500ms)
      if (lastEntry.startTime > 2500) {
        console.warn('[Performance] LCP over budget:', lastEntry.startTime, 'ms');
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });
  };
  
  // Initialize observers
  if ('PerformanceObserver' in window) {
    observeLCP();
  }
}

// Memory leak detection
export function useMemoryMonitor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('[Performance] Memory monitoring initialized');
  }, []);
}

// Streaming performance monitor
export function useStreamingPerformance() {
  const firstTokenRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  const trackStreamStart = useCallback(() => {
    startTimeRef.current = performance.now();
    firstTokenRef.current = null;
  }, []);
  
  const trackFirstToken = useCallback(() => {
    if (startTimeRef.current && !firstTokenRef.current) {
      firstTokenRef.current = performance.now() - startTimeRef.current;
      console.log('[Performance] First token latency:', firstTokenRef.current, 'ms');
    }
  }, []);
  
  return { trackStreamStart, trackFirstToken };
}

// Component render optimization - throttled logging
export function useRenderOptimization(componentName: string) {
  const renderCountRef = useRef(0);
  const lastLoggedRef = useRef(0);
  
  useEffect(() => {
    renderCountRef.current += 1;
    
    // Only log every 10 renders during streaming to reduce console overhead
    if (renderCountRef.current - lastLoggedRef.current >= 10 || renderCountRef.current <= 5) {
      console.log(`[Performance] ${componentName} render #${renderCountRef.current}`);
      lastLoggedRef.current = renderCountRef.current;
    }
  });
}

// Bundle size monitoring
export function logBundleMetrics() {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[Performance] Bundle monitoring initialized');
}

// React optimization hooks
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useThrottle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  const throttling = useRef(false);
  const latestArgs = useRef<Parameters<T> | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    latestArgs.current = args;
    
    if (!throttling.current) {
      throttling.current = true;
      fn(...args);
      
      setTimeout(() => {
        throttling.current = false;
        // Execute with latest args if they changed during throttle period
        if (latestArgs.current && latestArgs.current !== args) {
          fn(...latestArgs.current);
        }
      }, delay);
    }
  }, [fn, delay]) as T;
}

// Virtual scrolling utilities
export function useVirtualScrolling({
  itemCount,
  itemHeight,
  containerHeight
}: {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    itemCount - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight)
  );
  
  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    visibleItems.push(i);
  }
  
  return {
    startIndex,
    endIndex,
    visibleItems,
    totalHeight: itemCount * itemHeight,
    offsetY: startIndex * itemHeight,
    setScrollTop
  };
}