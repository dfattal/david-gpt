module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000',
        'http://localhost:3000/login'
      ],
      startServerCommand: 'pnpm start',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 10000,
      numberOfRuns: 3
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        
        // Core Web Vitals
        'first-contentful-paint': ['warn', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'first-input-delay': ['error', { maxNumericValue: 100 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'speed-index': ['warn', { maxNumericValue: 3000 }],
        
        // Performance metrics
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'max-potential-fid': ['warn', { maxNumericValue: 130 }],
        
        // Bundle size constraints
        'total-byte-weight': ['warn', { maxNumericValue: 400000 }],
        'unused-javascript': ['warn', { maxNumericValue: 20000 }],
        'unused-css-rules': ['warn', { maxNumericValue: 10000 }],
        
        // Resource optimization
        'uses-optimized-images': 'error',
        'uses-text-compression': 'error',
        'uses-responsive-images': 'warn',
        'efficient-animated-content': 'warn',
        
        // Best practices
        'no-console-errors': 'error',
        'no-unload-listeners': 'error',
        'uses-passive-event-listeners': 'warn'
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
}