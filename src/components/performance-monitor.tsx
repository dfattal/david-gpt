'use client'

import { useEffect } from 'react'
import { measureWebVitals, logBundleMetrics } from '@/lib/performance-client'

export function PerformanceMonitor() {
  useEffect(() => {
    // Initialize Web Vitals monitoring
    measureWebVitals()
    
    // Log bundle metrics in development
    logBundleMetrics()
    
    // Report to analytics in production
    if (process.env.NODE_ENV === 'production') {
      // This would integrate with your analytics service
      // e.g., Google Analytics, Vercel Analytics, etc.
      console.log('[Performance] Production monitoring initialized')
    }
  }, [])
  
  return null // This component doesn't render anything
}