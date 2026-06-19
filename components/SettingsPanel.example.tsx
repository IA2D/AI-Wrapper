/**
 * SettingsPanel Component Usage Example
 * 
 * This example demonstrates how to integrate the SettingsPanel component
 * into your application for managing API configuration settings.
 */

'use client';

import { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import { APIConfiguration } from '@/types';
import { StorageService } from '@/services/StorageService';

export default function SettingsPanelExample() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState<APIConfiguration>({
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    apiKey: '',
    model: 'Qwen/Qwen3.5-9B',
  });

  // Handle saving API configuration
  const handleSaveConfig = async (config: APIConfiguration) => {
    try {
      await StorageService.saveAPIConfig(config);
      setApiConfig(config);
      console.log('API configuration saved successfully');
    } catch (error) {
      console.error('Failed to save API configuration:', error);
    }
  };

  // Handle testing API connection
  const handleTestConnection = async (config: APIConfiguration): Promise<boolean> => {
    try {
      // Example: Make a test request to the API endpoint
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  };

  // Handle resetting to default configuration
  const handleResetConfig = () => {
    const defaultConfig: APIConfiguration = {
      endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
      apiKey: '',
      model: 'Qwen/Qwen3.5-9B',
    };
    setApiConfig(defaultConfig);
    handleSaveConfig(defaultConfig);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Settings Panel Example
        </h1>

        {/* Settings Button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="
            px-4 py-2 rounded-lg
            bg-blue-600 hover:bg-blue-700
            text-white font-medium
            transition-colors
            flex items-center gap-2
          "
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Open Settings
        </button>

        {/* Current Configuration Display */}
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Current API Configuration
          </h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Endpoint:
              </dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {apiConfig.endpoint}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                API Key:
              </dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {apiConfig.apiKey ? '••••••••' : 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Model:
              </dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {apiConfig.model}
              </dd>
            </div>
          </dl>
        </div>

        {/* SettingsPanel Component */}
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={apiConfig}
          onSave={handleSaveConfig}
          onTestConnection={handleTestConnection}
          onReset={handleResetConfig}
        />
      </div>
    </div>
  );
}
