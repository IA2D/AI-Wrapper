'use client';

import { useState, useEffect } from 'react';
import { APIConfiguration } from '@/types';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: APIConfiguration;
  onSave: (config: APIConfiguration) => void;
  onTestConnection: (config: APIConfiguration) => Promise<boolean>;
  onReset?: () => void;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  config,
  onSave,
  onTestConnection,
  onReset,
}: SettingsPanelProps) {
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;
  const [model, setModel] = useState(config.model);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  // Update local state when config prop changes
  useEffect(() => {
    setModel(config.model);
  }, [config]);

  // Reset test status when panel opens
  useEffect(() => {
    if (isOpen) {
      setTestStatus('idle');
      setTestMessage(null);
    }
  }, [isOpen]);

  // Handle test connection
  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage(null);

    try {
      const testConfig: APIConfiguration = {
        endpoint,
        apiKey,
        model,
      };

      const success = await onTestConnection(testConfig);
      
      if (success) {
        setTestStatus('success');
        setTestMessage('Connection successful!');
      } else {
        setTestStatus('failure');
        setTestMessage('Connection failed. Please check your .env configuration.');
      }
    } catch (error) {
      setTestStatus('failure');
      setTestMessage('Connection failed. Please check your .env configuration.');
    }
  };

  // Handle save
  const handleSave = () => {
    const newConfig: APIConfiguration = {
      endpoint,
      apiKey,
      model: model.trim(),
    };

    onSave(newConfig);
    onClose();
  };

  // Handle reset
  const handleReset = () => {
    onReset?.();
  };

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              API Settings
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="Close settings"
            >
              <svg
                className="w-5 h-5 text-gray-500 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Info message */}
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
              <p className="text-sm text-teal-800 dark:text-teal-300">
                API configuration is managed through environment variables. To change the API endpoint or key, update your .env file and restart the application.
              </p>
            </div>

            {/* Model */}
            <div>
              <label
                htmlFor="model"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Model
              </label>
              <input
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="
                  w-full px-3 py-2 rounded-lg
                  bg-white dark:bg-gray-700
                  border border-gray-300 dark:border-gray-600
                  text-gray-900 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-teal-500
                  transition-colors
                "
                placeholder="Qwen/Qwen3.5-9B"
              />
            </div>

            {/* Test Connection Button */}
            <div>
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="
                  w-full px-4 py-2 rounded-lg
                  bg-teal-600 hover:bg-teal-700
                  disabled:bg-gray-400 disabled:cursor-not-allowed
                  text-white font-medium
                  transition-colors
                  flex items-center justify-center gap-2
                "
              >
                {testStatus === 'testing' ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Testing Connection...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>

              {/* Test Status Message */}
              {testMessage && (
                <div
                  className={`
                    mt-2 p-3 rounded-lg text-sm
                    ${testStatus === 'success' 
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300' 
                      : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                    }
                  `}
                >
                  {testMessage}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-6 border-t border-gray-200 dark:border-gray-700 gap-3">
            {onReset && (
              <button
                onClick={handleReset}
                className="
                  px-4 py-2 rounded-lg
                  bg-red-100 dark:bg-red-900/20
                  hover:bg-red-200 dark:hover:bg-red-900/40
                  text-red-700 dark:text-red-400
                  font-medium
                  transition-colors
                "
              >
                Reset
              </button>
            )}
            <button
              onClick={onClose}
              className="
                px-4 py-2 rounded-lg
                bg-gray-200 dark:bg-gray-700
                hover:bg-gray-300 dark:hover:bg-gray-600
                text-gray-700 dark:text-gray-300
                font-medium
                transition-colors
              "
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="
                px-4 py-2 rounded-lg
                bg-teal-600 hover:bg-teal-700
                text-white font-medium
                transition-colors
              "
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
