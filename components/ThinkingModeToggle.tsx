'use client';

interface ThinkingModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function ThinkingModeToggle({
  enabled,
  onChange,
}: ThinkingModeToggleProps) {
  const handleToggle = () => {
    onChange(!enabled);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Toggle switch */}
      <button
        onClick={handleToggle}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
          ${enabled ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'}
        `}
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle thinking mode"
        title="Enable thinking mode to see the AI's reasoning process"
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full
            bg-white shadow-lg transition-transform duration-200 ease-in-out
            ${enabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>

      {/* Label with tooltip */}
      <div className="relative group">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-help">
          Thinking Mode
        </span>
        
        {/* Tooltip */}
        <div className="
          absolute left-0 top-full mt-2 w-64 p-3
          bg-gray-900 text-white text-xs rounded-lg shadow-lg
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-all duration-200 z-50
        ">
          <div className="relative">
            {/* Tooltip arrow */}
            <div className="absolute -top-5 left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900" />
            
            <p className="font-medium mb-1">What is Thinking Mode?</p>
            <p className="text-gray-300">
              When enabled, the AI will show its reasoning process before providing the final answer, 
              giving you insight into how it arrived at its response.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
