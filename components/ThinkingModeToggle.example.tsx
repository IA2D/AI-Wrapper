import { useState } from 'react';
import ThinkingModeToggle from './ThinkingModeToggle';

/**
 * Example usage of ThinkingModeToggle component
 * 
 * This component demonstrates how to integrate the thinking mode toggle
 * into your application. The toggle allows users to enable/disable the
 * AI's thinking process display.
 */
export default function ThinkingModeToggleExample() {
  const [thinkingMode, setThinkingMode] = useState(false);

  const handleThinkingModeChange = (enabled: boolean) => {
    setThinkingMode(enabled);
    console.log('Thinking mode changed to:', enabled);
    
    // In a real application, you would:
    // 1. Save the preference to local storage
    // 2. Update the API request parameters
    // 3. Potentially trigger a re-render of messages
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">ThinkingModeToggle Example</h2>
        <p className="text-gray-600 mb-6">
          Toggle the switch to enable or disable thinking mode. 
          Hover over the label to see the tooltip explanation.
        </p>
      </div>

      {/* Basic usage */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4">Basic Usage</h3>
        <ThinkingModeToggle
          enabled={thinkingMode}
          onChange={handleThinkingModeChange}
        />
      </div>

      {/* In a header context */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4">In Header Context</h3>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="font-semibold text-gray-900">Chat Interface</span>
          </div>
          <ThinkingModeToggle
            enabled={thinkingMode}
            onChange={handleThinkingModeChange}
          />
        </div>
      </div>

      {/* Current state display */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4">Current State</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">
            Thinking Mode: <span className={`font-semibold ${thinkingMode ? 'text-teal-600' : 'text-gray-400'}`}>
              {thinkingMode ? 'Enabled' : 'Disabled'}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {thinkingMode 
              ? 'The AI will show its reasoning process before providing answers.'
              : 'The AI will provide direct answers without showing the reasoning process.'
            }
          </p>
        </div>
      </div>

      {/* Dark mode example */}
      <div className="border border-gray-200 rounded-lg p-6 bg-gray-900">
        <h3 className="text-lg font-semibold mb-4 text-white">Dark Mode</h3>
        <ThinkingModeToggle
          enabled={thinkingMode}
          onChange={handleThinkingModeChange}
        />
      </div>
    </div>
  );
}
