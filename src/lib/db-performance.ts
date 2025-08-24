
// Query optimization utilities
export function optimizeQuery(queryBuilder: any, options: {
  useIndex?: string;
  limit?: number;
  timeout?: number;
}) {
  let query = queryBuilder;
  
  // Apply limit to prevent large result sets
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  // Add query timeout
  if (options.timeout) {
    query = query.abortSignal(AbortSignal.timeout(options.timeout));
  }
  
  return query;
}

// Database health monitoring
export function monitorDatabaseHealth(client: any) {
  if (typeof window === 'undefined') return;
  
  // Monitor connection health
  const interval = setInterval(async () => {
    try {
      const startTime = performance.now();
      await client.from('conversations').select('id').limit(1).single();
      const latency = performance.now() - startTime;
      
      console.log('[DB Health] Connection latency:', latency.toFixed(2), 'ms');
      
      if (latency > 1000) {
        console.warn('[DB Health] High database latency detected:', latency.toFixed(2), 'ms');
      }
    } catch (error) {
      console.error('[DB Health] Connection test failed:', error);
    }
  }, 60000); // Check every minute
  
  // Cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      clearInterval(interval);
    });
  }
  
  return () => clearInterval(interval);
}