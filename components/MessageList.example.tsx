import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import { Message, generateId } from '@/types';

/**
 * Example demonstrating MessageList with streaming message display
 * 
 * This example shows:
 * 1. Regular message display
 * 2. Streaming message with progressive content
 * 3. Typing indicator when streaming starts
 */
export default function MessageListStreamingExample() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateId(),
      role: 'user',
      content: { text: 'What is React?' },
      timestamp: new Date(Date.now() - 60000),
    },
    {
      id: generateId(),
      role: 'assistant',
      content: { 
        text: 'React is a JavaScript library for building user interfaces, particularly single-page applications.' 
      },
      timestamp: new Date(Date.now() - 50000),
    },
  ]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  // Simulate streaming response
  const simulateStreaming = () => {
    const fullResponse = 'React was created by Facebook and is now maintained by Meta and a community of developers. It uses a component-based architecture and a virtual DOM for efficient updates.';
    
    setIsStreaming(true);
    setStreamingContent('');
    
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        // Add 5-10 characters at a time to simulate streaming
        const chunkSize = Math.floor(Math.random() * 6) + 5;
        const chunk = fullResponse.slice(currentIndex, currentIndex + chunkSize);
        setStreamingContent(prev => prev + chunk);
        currentIndex += chunkSize;
      } else {
        // Streaming complete
        clearInterval(interval);
        
        // Add final message to history
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: { text: fullResponse },
          timestamp: new Date(),
        }]);
        
        // Reset streaming state
        setIsStreaming(false);
        setStreamingContent('');
      }
    }, 100);
  };

  // Auto-start streaming after 2 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      simulateStreaming();
    }, 2000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-white border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold">MessageList Streaming Example</h2>
        <p className="text-sm text-gray-600 mt-1">
          Watch the streaming message appear progressively
        </p>
      </div>

      <MessageList 
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
      />

      <div className="bg-white border-t border-gray-200 p-4">
        <button
          onClick={simulateStreaming}
          disabled={isStreaming}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isStreaming ? 'Streaming...' : 'Simulate Streaming Response'}
        </button>
      </div>
    </div>
  );
}
