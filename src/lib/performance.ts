// Server-side performance monitoring utilities

// Database query performance tracking
export function trackDatabaseQuery(queryName: string, startTime: number) {
  const duration = performance.now() - startTime;
  console.log(`[Performance] Database query ${queryName}:`, duration.toFixed(2), 'ms');
  
  // Track if over budget (varies by query type)
  const budgets: Record<string, number> = {
    'conversations-list': 500,
    'messages-load': 300,
    'message-insert': 200,
    'conversation-create': 200,
    'title-generate': 1000
  };
  
  const budget = budgets[queryName] || 500;
  if (duration > budget) {
    console.warn(`[Performance] Database query ${queryName} over budget:`, duration.toFixed(2), 'ms (budget:', budget, 'ms)');
  }
}

// Server-side performance logging
export function logServerPerformance(operation: string, duration: number) {
  console.log(`[Performance] Server ${operation}:`, duration.toFixed(2), 'ms');
}