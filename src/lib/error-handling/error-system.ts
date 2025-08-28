// Production-ready error handling and recovery system
// Implements retry logic, circuit breakers, and comprehensive error tracking

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface RAGError {
  type: ErrorType
  severity: ErrorSeverity
  message: string
  context: Record<string, any>
  timestamp: Date
  stackTrace?: string
  correlationId?: string
  userId?: string
  retryable: boolean
  retryCount: number
  maxRetries: number
}

export interface RetryConfig {
  maxRetries: number
  baseDelay: number // ms
  maxDelay: number // ms
  backoffMultiplier: number
  jitter: boolean
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  timeout: number // ms
  monitoringPeriod: number // ms
}

// Circuit Breaker Implementation
class CircuitBreaker {
  private failures: number = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private nextAttempt: number = 0
  private config: CircuitBreakerConfig

  constructor(config: CircuitBreakerConfig) {
    this.config = config
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      this.state = 'HALF_OPEN'
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    this.state = 'CLOSED'
  }

  private onFailure() {
    this.failures++
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.config.timeout
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      nextAttempt: this.nextAttempt
    }
  }
}

// Retry Utility with Exponential Backoff
class RetryHandler {
  private config: RetryConfig

  constructor(config: RetryConfig) {
    this.config = config
  }

  async execute<T>(
    operation: () => Promise<T>,
    context: string,
    isRetryable: (error: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (attempt === this.config.maxRetries || !isRetryable(error)) {
          throw error
        }

        const delay = this.calculateDelay(attempt)
        console.warn(`[Retry] Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed for ${context}. Retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          context
        })

        await this.delay(delay)
      }
    }

    throw lastError
  }

  private calculateDelay(attempt: number): number {
    const baseDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt)
    const delay = Math.min(baseDelay, this.config.maxDelay)
    
    if (this.config.jitter) {
      return delay + (Math.random() * delay * 0.1) // Add up to 10% jitter
    }
    
    return delay
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Error Classification and Recovery
export class ErrorHandler {
  private circuitBreakers = new Map<string, CircuitBreaker>()
  private retryHandler: RetryHandler
  private errorLog: RAGError[] = []
  private maxLogSize: number = 1000

  constructor() {
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    })

    // Initialize circuit breakers for critical services
    this.circuitBreakers.set('database', new CircuitBreaker({
      failureThreshold: 5,
      timeout: 30000,
      monitoringPeriod: 60000
    }))

    this.circuitBreakers.set('embeddings', new CircuitBreaker({
      failureThreshold: 3,
      timeout: 60000,
      monitoringPeriod: 120000
    }))

    this.circuitBreakers.set('search', new CircuitBreaker({
      failureThreshold: 10,
      timeout: 10000,
      monitoringPeriod: 30000
    }))
  }

  // Main error handling entry point
  async handleError(
    error: any,
    context: {
      operation: string
      service?: string
      userId?: string
      correlationId?: string
      metadata?: Record<string, any>
    }
  ): Promise<RAGError> {
    const ragError = this.classifyError(error, context)
    this.logError(ragError)

    // Alert for critical errors
    if (ragError.severity === ErrorSeverity.CRITICAL) {
      await this.sendAlert(ragError)
    }

    return ragError
  }

  // Execute operation with circuit breaker protection
  async withCircuitBreaker<T>(
    service: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(service)
    
    if (!circuitBreaker) {
      return operation()
    }

    try {
      return await circuitBreaker.execute(operation)
    } catch (error) {
      if (fallback && circuitBreaker.getState().state === 'OPEN') {
        console.warn(`[Circuit Breaker] Using fallback for ${service}`)
        return fallback()
      }
      throw error
    }
  }

  // Execute operation with retry logic
  async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const retryHandler = customRetryConfig 
      ? new RetryHandler({ ...this.retryHandler['config'], ...customRetryConfig })
      : this.retryHandler

    return retryHandler.execute(
      operation,
      context,
      (error) => this.isRetryable(error)
    )
  }

  private classifyError(error: any, context: any): RAGError {
    let type: ErrorType
    let severity: ErrorSeverity
    let retryable: boolean = false
    let maxRetries: number = 0

    // Classify by error type and characteristics
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      type = ErrorType.SYSTEM_ERROR
      severity = ErrorSeverity.HIGH
      retryable = false
    } else if (error.message?.includes('rate limit') || error.status === 429) {
      type = ErrorType.RATE_LIMIT_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = true
      maxRetries = 5
    } else if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
      type = ErrorType.NETWORK_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = true
      maxRetries = 3
    } else if (error.message?.includes('database') || error.code?.startsWith('P')) {
      type = ErrorType.DATABASE_ERROR
      severity = ErrorSeverity.HIGH
      retryable = true
      maxRetries = 2
    } else if (error.message?.includes('embedding') || error.message?.includes('OpenAI')) {
      type = ErrorType.EMBEDDING_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = true
      maxRetries = 3
    } else if (error.status === 401 || error.status === 403) {
      type = ErrorType.AUTHENTICATION_ERROR
      severity = ErrorSeverity.HIGH
      retryable = false
    } else if (error.status >= 400 && error.status < 500) {
      type = ErrorType.VALIDATION_ERROR
      severity = ErrorSeverity.LOW
      retryable = false
    } else {
      type = ErrorType.PROCESSING_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = true
      maxRetries = 2
    }

    return {
      type,
      severity,
      message: error.message || 'Unknown error',
      context: {
        operation: context.operation,
        service: context.service,
        metadata: context.metadata,
        errorName: error.name,
        errorCode: error.code,
        statusCode: error.status
      },
      timestamp: new Date(),
      stackTrace: error.stack,
      correlationId: context.correlationId,
      userId: context.userId,
      retryable,
      retryCount: 0,
      maxRetries
    }
  }

  private isRetryable(error: any): boolean {
    // Don't retry validation errors or auth errors
    if (error.status >= 400 && error.status < 500) {
      return error.status === 429 // Only retry rate limits
    }

    // Retry server errors and network errors
    if (error.status >= 500 || error.code === 'ECONNREFUSED') {
      return true
    }

    // Retry specific error types
    const retryableMessages = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      'temporary failure'
    ]

    return retryableMessages.some(msg => 
      error.message?.toLowerCase().includes(msg)
    )
  }

  private logError(error: RAGError) {
    this.errorLog.push(error)
    
    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize)
    }

    // Log to console with appropriate level
    const logLevel = this.getSeverityLogLevel(error.severity)
    console[logLevel](`[RAG Error] ${error.type}: ${error.message}`, {
      severity: error.severity,
      context: error.context,
      correlationId: error.correlationId,
      retryable: error.retryable
    })
  }

  private getSeverityLogLevel(severity: ErrorSeverity): 'info' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info'
      case ErrorSeverity.MEDIUM:
        return 'warn'
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'error'
      default:
        return 'warn'
    }
  }

  private async sendAlert(error: RAGError) {
    // In production, this would integrate with alerting systems
    console.error(`[CRITICAL ALERT] RAG System Error`, {
      type: error.type,
      message: error.message,
      context: error.context,
      timestamp: error.timestamp
    })

    // Could integrate with services like:
    // - Slack/Discord webhooks
    // - Email notifications
    // - PagerDuty
    // - Sentry
  }

  // Recovery operations
  async recoverFromError(error: RAGError): Promise<boolean> {
    switch (error.type) {
      case ErrorType.DATABASE_ERROR:
        return this.recoverDatabase()
      
      case ErrorType.EMBEDDING_ERROR:
        return this.recoverEmbeddings()
      
      case ErrorType.RATE_LIMIT_ERROR:
        return this.handleRateLimit(error)
      
      default:
        return false
    }
  }

  private async recoverDatabase(): Promise<boolean> {
    try {
      // Test database connection
      // In production, this would ping the database
      console.log('[Recovery] Attempting database recovery')
      return true
    } catch {
      return false
    }
  }

  private async recoverEmbeddings(): Promise<boolean> {
    try {
      // Reset embedding service state
      console.log('[Recovery] Attempting embeddings service recovery')
      return true
    } catch {
      return false
    }
  }

  private async handleRateLimit(error: RAGError): Promise<boolean> {
    // Extract retry-after from context if available
    const retryAfter = error.context.retryAfter || 60000
    console.log(`[Recovery] Rate limited, waiting ${retryAfter}ms`)
    
    await new Promise(resolve => setTimeout(resolve, retryAfter))
    return true
  }

  // Monitoring and metrics
  getErrorStats() {
    const now = Date.now()
    const last24h = this.errorLog.filter(e => now - e.timestamp.getTime() < 24 * 60 * 60 * 1000)
    const lastHour = this.errorLog.filter(e => now - e.timestamp.getTime() < 60 * 60 * 1000)

    const errorsByType = last24h.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const errorsBySeverity = last24h.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      total: this.errorLog.length,
      last24h: last24h.length,
      lastHour: lastHour.length,
      errorsByType,
      errorsBySeverity,
      circuitBreakerStates: Array.from(this.circuitBreakers.entries()).reduce((acc, [service, cb]) => {
        acc[service] = cb.getState()
        return acc
      }, {} as Record<string, any>)
    }
  }

  clearErrorLog() {
    this.errorLog = []
  }

  getRecentErrors(limit: number = 10): RAGError[] {
    return this.errorLog.slice(-limit)
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler()

// Helper functions for common error handling patterns
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: {
    operation: string
    service?: string
    userId?: string
    fallback?: () => Promise<T>
  }
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    const ragError = await errorHandler.handleError(error, context)
    
    // Try recovery if retryable
    if (ragError.retryable) {
      const recovered = await errorHandler.recoverFromError(ragError)
      if (recovered) {
        try {
          return await operation()
        } catch (retryError) {
          // Recovery failed, use fallback if available
          if (context.fallback) {
            return context.fallback()
          }
        }
      }
    }

    // Use fallback if available
    if (context.fallback) {
      return context.fallback()
    }

    throw error
  }
}