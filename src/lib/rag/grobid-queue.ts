/**
 * GROBID Request Queue
 *
 * Singleton queue manager to ensure sequential processing of GROBID API requests
 * and prevent 503 Service Unavailable errors from concurrent requests.
 */

interface QueuedRequest<T> {
  id: string;
  request: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
  createdAt: Date;
}

interface GROBIDQueueConfig {
  requestDelay: number; // Delay between requests (ms)
  maxRetries: number; // Maximum retry attempts
  requestTimeout: number; // Request timeout (ms)
  retryBackoffMs: number; // Base backoff for retries (ms)
  enableLogging: boolean; // Enable detailed logging
}

export class GROBIDQueue {
  private static instance: GROBIDQueue;
  private queue: QueuedRequest<any>[] = [];
  private isProcessing = false;
  private currentRequestId: string | null = null;
  private config: GROBIDQueueConfig;
  private processedCount = 0;
  private failedCount = 0;

  private constructor() {
    this.config = {
      requestDelay: parseInt(process.env.GROBID_REQUEST_DELAY || '2000', 10),
      maxRetries: parseInt(process.env.GROBID_MAX_RETRIES || '3', 10),
      requestTimeout: parseInt(process.env.GROBID_TIMEOUT || '60000', 10),
      retryBackoffMs: parseInt(process.env.GROBID_RETRY_BACKOFF || '1000', 10),
      enableLogging: process.env.NODE_ENV !== 'production',
    };

    if (this.config.enableLogging) {
      console.log('🔧 GROBID Queue initialized with config:', this.config);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GROBIDQueue {
    if (!GROBIDQueue.instance) {
      GROBIDQueue.instance = new GROBIDQueue();
    }
    return GROBIDQueue.instance;
  }

  /**
   * Add request to queue for sequential processing
   */
  async enqueue<T>(
    request: () => Promise<T>,
    options: { maxRetries?: number; timeout?: number } = {}
  ): Promise<T> {
    const requestId = `grobid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const maxRetries = options.maxRetries ?? this.config.maxRetries;

    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest<T> = {
        id: requestId,
        request,
        resolve,
        reject,
        retries: 0,
        maxRetries,
        createdAt: new Date(),
      };

      this.queue.push(queuedRequest);

      if (this.config.enableLogging) {
        console.log(
          `📥 GROBID request queued: ${requestId} (queue size: ${this.queue.length})`
        );
      }

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queue sequentially with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const queuedRequest = this.queue.shift()!;
      this.currentRequestId = queuedRequest.id;

      try {
        if (this.config.enableLogging) {
          console.log(
            `🔄 Processing GROBID request: ${queuedRequest.id} (attempt ${queuedRequest.retries + 1}/${queuedRequest.maxRetries + 1})`
          );
        }

        // Execute request with timeout
        const result = await this.executeWithTimeout(
          queuedRequest.request,
          this.config.requestTimeout
        );

        // Success
        queuedRequest.resolve(result);
        this.processedCount++;

        if (this.config.enableLogging) {
          console.log(
            `✅ GROBID request completed: ${queuedRequest.id} (total processed: ${this.processedCount})`
          );
        }
      } catch (error) {
        const isRetryableError = this.isRetryableError(error);
        const canRetry =
          queuedRequest.retries < queuedRequest.maxRetries && isRetryableError;

        if (canRetry) {
          // Retry with exponential backoff
          queuedRequest.retries++;
          const backoffDelay =
            this.config.retryBackoffMs * Math.pow(2, queuedRequest.retries - 1);

          if (this.config.enableLogging) {
            console.log(
              `⚠️  GROBID request failed, retrying: ${queuedRequest.id} (${error.message}) - backoff: ${backoffDelay}ms`
            );
          }

          // Add back to front of queue after backoff
          setTimeout(() => {
            this.queue.unshift(queuedRequest);
          }, backoffDelay);
        } else {
          // Failed permanently
          this.failedCount++;
          queuedRequest.reject(
            error instanceof Error ? error : new Error('GROBID request failed')
          );

          if (this.config.enableLogging) {
            console.error(
              `❌ GROBID request failed permanently: ${queuedRequest.id} (${error.message}) - total failed: ${this.failedCount}`
            );
          }
        }
      }

      this.currentRequestId = null;

      // Rate limiting delay between requests (except for retries)
      if (this.queue.length > 0) {
        if (this.config.enableLogging) {
          console.log(
            `⏳ GROBID rate limiting delay: ${this.config.requestDelay}ms`
          );
        }
        await this.delay(this.config.requestDelay);
      }
    }

    this.isProcessing = false;

    if (this.config.enableLogging) {
      console.log(
        `🏁 GROBID queue processing completed. Processed: ${this.processedCount}, Failed: ${this.failedCount}`
      );
    }
  }

  /**
   * Execute request with timeout
   */
  private async executeWithTimeout<T>(
    request: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`GROBID request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      request()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || error.code;

    // Retryable conditions
    const retryableConditions = [
      // HTTP status codes
      errorStatus === 503, // Service Unavailable
      errorStatus === 502, // Bad Gateway
      errorStatus === 504, // Gateway Timeout
      errorStatus === 429, // Too Many Requests

      // Error messages
      errorMessage.includes('service unavailable'),
      errorMessage.includes('timeout'),
      errorMessage.includes('connection'),
      errorMessage.includes('network'),
      errorMessage.includes('econnreset'),
      errorMessage.includes('enotfound'),

      // Fetch errors
      errorMessage.includes('fetch'),
      errorMessage.includes('abort'),
    ];

    return retryableConditions.some(condition => condition);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue status for monitoring
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      currentRequestId: this.currentRequestId,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      config: this.config,
    };
  }

  /**
   * Clear the queue (for testing/emergency)
   */
  clear(): void {
    this.queue.forEach(req => req.reject(new Error('Queue cleared')));
    this.queue = [];
    this.isProcessing = false;
    this.currentRequestId = null;

    if (this.config.enableLogging) {
      console.log('🧹 GROBID queue cleared');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GROBIDQueueConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.config.enableLogging) {
      console.log('🔧 GROBID Queue config updated:', this.config);
    }
  }
}

// Export singleton instance for easy access
export const grobidQueue = GROBIDQueue.getInstance();
