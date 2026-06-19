import { ErrorType, AppError, StorageError } from '../types';

/**
 * ErrorHandler class for classifying and handling different error types
 * Provides user-friendly error messages for various error scenarios
 */
export class ErrorHandler {
  /**
   * Main error handling method that classifies errors and returns AppError
   * @param error - The error to handle (can be any type)
   * @returns AppError with classified type and user-friendly message
   */
  static async handle(error: unknown): Promise<AppError> {
    // Handle storage errors
    if (error instanceof StorageError) {
      return this.handleStorageError(error);
    }

    // Handle API errors (Response objects)
    if (error instanceof Response) {
      return await this.handleAPIError(error);
    }

    // Handle network errors (TypeError with fetch-related messages)
    if (error instanceof TypeError && 
        (error.message.includes('fetch') || error.message.includes('network'))) {
      return this.handleNetworkError(error);
    }

    // Handle generic errors
    if (error instanceof Error) {
      return {
        type: ErrorType.VALIDATION_ERROR,
        message: error.message || 'An unexpected error occurred',
        details: error,
      };
    }

    // Handle unknown error types
    return {
      type: ErrorType.VALIDATION_ERROR,
      message: 'An unexpected error occurred',
      details: error,
    };
  }

  /**
   * Handle storage-specific errors
   * @param error - StorageError instance
   * @returns AppError with appropriate type and message
   */
  static handleStorageError(error: StorageError): AppError {
    if (error.code === 'QUOTA_EXCEEDED') {
      return {
        type: ErrorType.QUOTA_EXCEEDED,
        message: 'Storage is full. Please delete old conversations to free up space.',
        details: error,
      };
    }

    if (error.code === 'ACCESS_DENIED') {
      return {
        type: ErrorType.STORAGE_ERROR,
        message: 'Unable to access browser storage. Please check your browser settings.',
        details: error,
      };
    }

    if (error.code === 'PARSE_ERROR') {
      return {
        type: ErrorType.STORAGE_ERROR,
        message: 'Failed to read saved data. Your data may be corrupted.',
        details: error,
      };
    }

    return {
      type: ErrorType.STORAGE_ERROR,
      message: 'Failed to save data. Please try again.',
      details: error,
    };
  }

  /**
   * Handle API response errors
   * @param response - Response object from failed API call
   * @returns AppError with appropriate type and message
   */
  static async handleAPIError(response: Response): Promise<AppError> {
    let body: any = {};
    
    try {
      body = await response.json();
    } catch {
      // If response body is not JSON, use empty object
    }

    // Handle authentication errors (401, 403)
    if (response.status === 401 || response.status === 403) {
      return {
        type: ErrorType.AUTHENTICATION_ERROR,
        message: 'Invalid API credentials. Please check your settings and try again.',
        details: { status: response.status, body },
      };
    }

    // Handle rate limiting
    if (response.status === 429) {
      return {
        type: ErrorType.API_ERROR,
        message: 'Too many requests. Please wait a moment and try again.',
        details: { status: response.status, body },
      };
    }

    // Handle server errors
    if (response.status >= 500) {
      return {
        type: ErrorType.API_ERROR,
        message: 'The AI service is temporarily unavailable. Please try again later.',
        details: { status: response.status, body },
      };
    }

    // Handle other API errors with custom message if available
    const errorMessage = body.error?.message || body.message || 'Failed to get response from AI service';
    
    return {
      type: ErrorType.API_ERROR,
      message: errorMessage,
      details: { status: response.status, body },
    };
  }

  /**
   * Handle network-related errors
   * @param error - TypeError from network failure
   * @returns AppError with network error type
   */
  static handleNetworkError(error: TypeError): AppError {
    return {
      type: ErrorType.NETWORK_ERROR,
      message: 'No internet connection. Please check your network and try again.',
      details: error,
    };
  }

  /**
   * Log error details to console for debugging
   * @param error - The error to log
   */
  static logError(error: unknown): void {
    if (error instanceof Error) {
      console.error('Error occurred:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: (error as any).cause,
        details: (error as any).details,
      });
    } else {
      console.error('Error occurred:', error);
    }
  }
}

/**
 * Retry utility function with exponential backoff
 * Retries failed operations with increasing delays between attempts
 * Skips retry for authentication errors (401, 403)
 * 
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @returns Promise resolving to the function result
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | Response | unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on authentication errors (401, 403)
      // Check if error is a Response-like object with status property
      if (isResponseWithStatus(error) && (error.status === 401 || error.status === 403)) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate exponential backoff delay: initialDelay * 2^attempt
      const delay = initialDelay * Math.pow(2, attempt);
      
      // Log retry attempt
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
      
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Type guard to check if an error is a Response-like object with status
 * @param error - The error to check
 * @returns true if error has a status property
 */
function isResponseWithStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as any).status === 'number';
}
