import { useMemo } from 'react';
import { QwenAPIClient } from '../services/QwenAPIClient';
import { APIConfiguration } from '../types';

/**
 * Custom hook for managing QwenAPIClient instance
 * Recreates client when configuration changes
 * 
 * @param config - API configuration
 * @returns QwenAPIClient instance
 */
export function useAPIClient(config: APIConfiguration): QwenAPIClient {
  // Memoize the API client, recreating only when config changes
  const apiClient = useMemo(() => {
    return new QwenAPIClient(config);
  }, [config.endpoint, config.apiKey, config.model]);

  return apiClient;
}
