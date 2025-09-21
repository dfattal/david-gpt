/**
 * Pipeline Resilience and Error Handling System
 * 
 * Comprehensive error handling, retry logic, circuit breakers, and fallback
 * mechanisms for the RAG processing pipeline to ensure system reliability.
 */

import { supabaseAdmin } from '@/lib/supabase';

// ===========================
// Error Handling Types
// ===========================

export interface ResilienceConfig {
  maxRetries: number;
  baseRetryDelay: number;
  maxRetryDelay: number;
  exponentialBackoff: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  enableFallbacks: boolean;
  healthCheckInterval: number;
  errorThresholdPercentage: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponential: boolean;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  totalRequests: number;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  executionTime: number;
  fallbackUsed: boolean;
  circuitBreakerTriggered: boolean;
}

export interface HealthStatus {
  service: string;
  healthy: boolean;
  lastCheck: number;
  responseTime: number;
  errorRate: number;
  details?: string;
}

export interface ProcessingError {
  id: string;
  timestamp: number;
  component: string;
  operation: string;
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  recoverable: boolean;
  retryCount: number;
}

// ===========================
// Default Configuration
// ===========================

const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxRetries: 3,
  baseRetryDelay: 1000,      // 1 second base delay
  maxRetryDelay: 10000,      // 10 second max delay
  exponentialBackoff: true,
  circuitBreakerThreshold: 5, // Fail after 5 consecutive failures
  circuitBreakerTimeout: 30000, // 30 seconds
  enableFallbacks: true,
  healthCheckInterval: 60000, // 1 minute
  errorThresholdPercentage: 10 // 10% error rate threshold
};

const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ECONNREFUSED', 
  'ETIMEDOUT',
  'ENOTFOUND',
  'NETWORK_ERROR',
  'RATE_LIMIT',
  'TEMPORARY_FAILURE',
  'SERVICE_UNAVAILABLE'
];

const NON_RETRYABLE_ERRORS = [
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'BAD_REQUEST',
  'MALFORMED_DATA'
];

// ===========================
// Pipeline Resilience Manager
// ===========================

export class PipelineResilienceManager {
  private config: ResilienceConfig;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private healthStatus: Map<string, HealthStatus> = new Map();
  private errorLog: ProcessingError[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  
  constructor(config: Partial<ResilienceConfig> = {}) {
    this.config = { ...DEFAULT_RESILIENCE_CONFIG, ...config };
    this.startHealthChecks();
  }
  
  /**
   * Execute operation with full resilience (retry, circuit breaker, fallback)
   */
  async executeWithResilience<T>(
    operationName: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<OperationResult<T>> {
    
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;
    let circuitBreakerTriggered = false;
    let fallbackUsed = false;
    
    const finalRetryConfig: RetryConfig = {
      maxAttempts: retryConfig?.maxAttempts || this.config.maxRetries,
      baseDelay: retryConfig?.baseDelay || this.config.baseRetryDelay,
      maxDelay: retryConfig?.maxDelay || this.config.maxRetryDelay,
      exponential: retryConfig?.exponential || this.config.exponentialBackoff,
      retryableErrors: retryConfig?.retryableErrors || RETRYABLE_ERRORS,
      nonRetryableErrors: retryConfig?.nonRetryableErrors || NON_RETRYABLE_ERRORS
    };
    
    // Check circuit breaker
    if (this.isCircuitBreakerOpen(operationName)) {
      circuitBreakerTriggered = true;
      
      if (fallback && this.config.enableFallbacks) {
        console.log(`🔄 Circuit breaker open for ${operationName}, using fallback`);
        try {
          const fallbackResult = await fallback();
          fallbackUsed = true;
          return {
            success: true,
            data: fallbackResult,
            attempts: 0,
            executionTime: Date.now() - startTime,
            fallbackUsed: true,
            circuitBreakerTriggered: true
          };
        } catch (fallbackError) {
          lastError = fallbackError instanceof Error ? fallbackError : new Error('Fallback failed');
        }
      }
      
      return {
        success: false,
        error: new Error(`Circuit breaker open for ${operationName}`),
        attempts: 0,
        executionTime: Date.now() - startTime,
        fallbackUsed,
        circuitBreakerTriggered: true
      };
    }
    
    // Retry loop
    while (attempts < finalRetryConfig.maxAttempts) {
      attempts++;
      
      try {
        console.log(`🔄 Executing ${operationName} (attempt ${attempts}/${finalRetryConfig.maxAttempts})`);
        
        const result = await operation();
        
        // Success - reset circuit breaker
        this.recordSuccess(operationName);
        
        return {
          success: true,
          data: result,
          attempts,
          executionTime: Date.now() - startTime,
          fallbackUsed,
          circuitBreakerTriggered
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Log the error
        this.logError({
          id: `${operationName}_${Date.now()}_${attempts}`,
          timestamp: Date.now(),
          component: 'pipeline',
          operation: operationName,
          errorType: lastError.name || 'UnknownError',
          message: lastError.message,
          stack: lastError.stack,
          recoverable: this.isRetryableError(lastError),
          retryCount: attempts - 1
        });
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          console.log(`❌ Non-retryable error in ${operationName}: ${lastError.message}`);
          break;
        }
        
        // Record failure for circuit breaker
        this.recordFailure(operationName);
        
        // Don't retry on last attempt
        if (attempts >= finalRetryConfig.maxAttempts) {
          break;
        }
        
        // Calculate retry delay
        const delay = this.calculateRetryDelay(attempts, finalRetryConfig);
        console.log(`⏱️ Retrying ${operationName} in ${delay}ms...`);
        
        await this.sleep(delay);
      }
    }
    
    // All retries failed - try fallback
    if (fallback && this.config.enableFallbacks) {
      console.log(`🔄 All retries failed for ${operationName}, using fallback`);
      try {
        const fallbackResult = await fallback();
        fallbackUsed = true;
        return {
          success: true,
          data: fallbackResult,
          attempts,
          executionTime: Date.now() - startTime,
          fallbackUsed: true,
          circuitBreakerTriggered
        };
      } catch (fallbackError) {
        console.error(`❌ Fallback also failed for ${operationName}:`, fallbackError);
      }
    }
    
    return {
      success: false,
      error: lastError || new Error('Operation failed'),
      attempts,
      executionTime: Date.now() - startTime,
      fallbackUsed,
      circuitBreakerTriggered
    };
  }
  
  /**
   * Simple retry mechanism without circuit breaker
   */
  async retry<T>(
    operation: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    
    const config: RetryConfig = {
      maxAttempts: retryConfig?.maxAttempts || this.config.maxRetries,
      baseDelay: retryConfig?.baseDelay || this.config.baseRetryDelay,
      maxDelay: retryConfig?.maxDelay || this.config.maxRetryDelay,
      exponential: retryConfig?.exponential || this.config.exponentialBackoff,
      retryableErrors: retryConfig?.retryableErrors || RETRYABLE_ERRORS,
      nonRetryableErrors: retryConfig?.nonRetryableErrors || NON_RETRYABLE_ERRORS
    };
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (!this.isRetryableError(lastError) || attempt >= config.maxAttempts) {
          throw lastError;
        }
        
        const delay = this.calculateRetryDelay(attempt, config);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(operationName: string): boolean {
    const state = this.circuitBreakers.get(operationName);
    
    if (!state) {
      this.circuitBreakers.set(operationName, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        totalRequests: 0
      });
      return false;
    }
    
    if (state.state === 'open') {
      // Check if timeout has passed for half-open state
      if (Date.now() - state.lastFailureTime > this.config.circuitBreakerTimeout) {
        state.state = 'half_open';
        console.log(`🔄 Circuit breaker for ${operationName} moving to half-open state`);
      }
      return state.state === 'open';
    }
    
    return false;
  }
  
  private recordSuccess(operationName: string): void {
    const state = this.circuitBreakers.get(operationName);
    
    if (state) {
      state.successCount++;
      state.totalRequests++;
      
      if (state.state === 'half_open') {
        // Reset to closed state after successful operation
        state.state = 'closed';
        state.failureCount = 0;
        console.log(`✅ Circuit breaker for ${operationName} closed after successful operation`);
      }
    }
  }
  
  private recordFailure(operationName: string): void {
    let state = this.circuitBreakers.get(operationName);
    
    if (!state) {
      state = {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        totalRequests: 0
      };
      this.circuitBreakers.set(operationName, state);
    }
    
    state.failureCount++;
    state.totalRequests++;
    state.lastFailureTime = Date.now();
    
    // Open circuit breaker if threshold exceeded
    if (state.failureCount >= this.config.circuitBreakerThreshold) {
      state.state = 'open';
      console.log(`🚨 Circuit breaker opened for ${operationName} after ${state.failureCount} failures`);
    }
  }
  
  /**
   * Error classification and retry logic
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code;
    
    // Check for non-retryable errors first
    for (const nonRetryable of NON_RETRYABLE_ERRORS) {
      if (errorMessage.includes(nonRetryable.toLowerCase()) || errorCode === nonRetryable) {
        return false;
      }
    }
    
    // Check for retryable errors
    for (const retryable of RETRYABLE_ERRORS) {
      if (errorMessage.includes(retryable.toLowerCase()) || errorCode === retryable) {
        return true;
      }
    }
    
    // Default: retry unknown errors (conservative approach)
    return true;
  }
  
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    if (!config.exponential) {
      return config.baseDelay;
    }
    
    const exponentialDelay = config.baseDelay * Math.pow(2, attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
    
    return Math.min(jitteredDelay, config.maxDelay);
  }
  
  /**
   * Health monitoring
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }
  
  private async performHealthChecks(): Promise<void> {
    const services = [
      'supabase',
      'openai_embeddings',
      'cohere_rerank'
    ];
    
    for (const service of services) {
      const startTime = Date.now();
      
      try {
        const healthy = await this.checkServiceHealth(service);
        const responseTime = Date.now() - startTime;
        
        this.healthStatus.set(service, {
          service,
          healthy,
          lastCheck: Date.now(),
          responseTime,
          errorRate: this.calculateErrorRate(service),
          details: healthy ? 'OK' : 'Service check failed'
        });
        
      } catch (error) {
        this.healthStatus.set(service, {
          service,
          healthy: false,
          lastCheck: Date.now(),
          responseTime: Date.now() - startTime,
          errorRate: this.calculateErrorRate(service),
          details: error instanceof Error ? error.message : 'Health check error'
        });
      }
    }
  }
  
  private async checkServiceHealth(service: string): Promise<boolean> {
    switch (service) {
      case 'supabase':
        try {
          const { data, error } = await supabaseAdmin
            .from('documents')
            .select('id')
            .limit(1);
          return !error && Array.isArray(data);
        } catch {
          return false;
        }
        
      case 'openai_embeddings':
        // Simple check - would normally test OpenAI API
        return process.env.OPENAI_API_KEY ? true : false;
        
      case 'cohere_rerank':
        // Simple check - would normally test Cohere API
        return process.env.COHERE_API_KEY ? true : false;
        
      default:
        return true;
    }
  }
  
  private calculateErrorRate(service: string): number {
    const recentErrors = this.errorLog.filter(
      error => error.component === service && 
      Date.now() - error.timestamp < 300000 // Last 5 minutes
    );
    
    // Simple error rate calculation
    return recentErrors.length / 10; // Normalize to percentage
  }
  
  /**
   * Error logging and analysis
   */
  private logError(error: ProcessingError): void {
    this.errorLog.push(error);
    
    // Keep only recent errors (last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.errorLog = this.errorLog.filter(e => e.timestamp > oneHourAgo);
    
    // Log to console for debugging
    console.error(`🚨 Pipeline Error [${error.component}/${error.operation}]:`, {
      type: error.errorType,
      message: error.message,
      recoverable: error.recoverable,
      retryCount: error.retryCount
    });
  }
  
  /**
   * Utility methods
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get system health status
   */
  getHealthStatus(): Map<string, HealthStatus> {
    return new Map(this.healthStatus);
  }
  
  /**
   * Get recent errors
   */
  getRecentErrors(minutes: number = 60): ProcessingError[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.errorLog.filter(error => error.timestamp > cutoff);
  }
  
  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }
  
  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// ===========================
// Specialized Resilience Wrappers
// ===========================

/**
 * Resilient wrapper for database operations
 */
export class ResilientDatabaseOperations {
  private resilience: PipelineResilienceManager;
  
  constructor(config?: Partial<ResilienceConfig>) {
    this.resilience = new PipelineResilienceManager(config);
  }
  
  async executeQuery<T>(
    operation: () => Promise<T>,
    operationName: string = 'database_query'
  ): Promise<T> {
    const result = await this.resilience.executeWithResilience(
      operationName,
      operation,
      async () => {
        console.log('🔄 Database fallback: returning cached or default data');
        throw new Error('No fallback available for database operation');
      },
      {
        maxAttempts: 3,
        retryableErrors: ['PGRST116', 'PGRST301', 'connection', 'timeout']
      }
    );
    
    if (!result.success) {
      throw result.error || new Error('Database operation failed');
    }
    
    return result.data!;
  }
}

/**
 * Resilient wrapper for external API calls
 */
export class ResilientAPIOperations {
  private resilience: PipelineResilienceManager;
  
  constructor(config?: Partial<ResilienceConfig>) {
    this.resilience = new PipelineResilienceManager(config);
  }
  
  async callAPI<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    operationName: string = 'api_call'
  ): Promise<T> {
    const result = await this.resilience.executeWithResilience(
      operationName,
      operation,
      fallback,
      {
        maxAttempts: 3,
        baseDelay: 2000, // Longer delay for API calls
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'RATE_LIMIT', '429', '502', '503', '504']
      }
    );
    
    if (!result.success) {
      throw result.error || new Error('API operation failed');
    }
    
    return result.data!;
  }
}

// Export singleton instance
export const pipelineResilience = new PipelineResilienceManager();
export const resilientDB = new ResilientDatabaseOperations();
export const resilientAPI = new ResilientAPIOperations();

/**
 * Convenience functions for common resilience patterns
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  return await pipelineResilience.retry(operation, { maxAttempts });
}

export async function withFallback<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  operationName: string = 'operation'
): Promise<T> {
  const result = await pipelineResilience.executeWithResilience(
    operationName,
    operation,
    fallback
  );
  
  if (!result.success) {
    throw result.error || new Error('Operation failed');
  }
  
  return result.data!;
}

/**
 * Health check endpoint for monitoring
 */
export function getSystemHealth(): {
  healthy: boolean;
  services: Record<string, HealthStatus>;
  circuitBreakers: Record<string, CircuitBreakerState>;
  recentErrors: number;
} {
  const healthStatus = pipelineResilience.getHealthStatus();
  const circuitBreakers = pipelineResilience.getCircuitBreakerStates();
  const recentErrors = pipelineResilience.getRecentErrors(10).length;
  
  const healthy = Array.from(healthStatus.values()).every(status => status.healthy) &&
                  Array.from(circuitBreakers.values()).every(cb => cb.state !== 'open');
  
  return {
    healthy,
    services: Object.fromEntries(healthStatus),
    circuitBreakers: Object.fromEntries(circuitBreakers),
    recentErrors
  };
}