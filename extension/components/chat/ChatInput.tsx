import React, { useState, useRef, useEffect } from 'react';
import { voiceService } from '../../services/voice';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMode } from '../../types';

interface ChatInputProps {
  onSend: (message: string, mode?: ChatMode) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const selectedMode = useChatStore((state) => state.selectedMode);
  const setSelectedMode = useChatStore((state) => state.setSelectedMode);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      voiceService.destroy();
    };
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed, selectedMode);
      setValue('');
    }
  };

  const getModeIcon = (mode: ChatMode) => {
    switch (mode) {
      case 'ask':
        return <ChatBubbleIcon className="w-3.5 h-3.5" />;
      case 'search':
        return <SearchIcon className="w-3.5 h-3.5" />;
      case 'comparison':
        return <ScaleIcon className="w-3.5 h-3.5" />;
      case 'auto':
        return <SparklesIcon className="w-3.5 h-3.5" />;
    }
  };

  const getModeLabel = (mode: ChatMode) => {
    switch (mode) {
      case 'ask':
        return 'Ask';
      case 'search':
        return 'Search';
      case 'comparison':
        return 'Compare';
      case 'auto':
        return 'Auto';
    }
  };

  const getModeDescription = (mode: ChatMode) => {
    switch (mode) {
      case 'ask':
        return 'Quick answers without product search';
      case 'search':
        return 'Find and recommend products';
      case 'comparison':
        return 'Compare selected products in depth';
      case 'auto':
        return 'Automatically choose the best mode';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setRecordingDuration(0);

      await voiceService.startRecording();
      setIsRecording(true);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      console.error('Recording error:', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setIsRecording(false);
      setIsProcessing(true);

      const result = await voiceService.stopRecording();

      if (result.text) {
        // Auto-send the transcribed text
        onSend(result.text);
      } else {
        setError('No speech detected. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process recording';
      setError(errorMessage);
      console.error('Stop recording error:', err);
    } finally {
      setIsProcessing(false);
      setRecordingDuration(0);
    }
  };

  const handleVoiceButtonClick = () => {
    if (disabled || isProcessing) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasText = value.trim().length > 0;
  const modes: ChatMode[] = ['auto', 'search', 'ask', 'comparison'];

  return (
    <div className="relative">
      {/* Mode Selector */}
      <div className="mb-2 flex gap-2">
        {modes.map((mode) => (
          <button
            key={mode}
            onClick={() => setSelectedMode(mode)}
            disabled={disabled}
            className={`
              flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5
              ${selectedMode === mode
                ? 'bg-accent-orange text-white shadow-sm'
                : 'bg-glass backdrop-blur-md text-text-secondary hover:bg-glass-dark hover:text-text-primary'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            title={getModeDescription(mode)}
          >
            {getModeIcon(mode)}
            <span>{getModeLabel(mode)}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'Ask about any product...'}
          rows={1}
          className="w-full px-4 py-3 pr-12 bg-glass backdrop-blur-md rounded-2xl text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-2 focus:ring-accent-orange/20 resize-none overflow-y-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glass-sm"
        />

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-glass backdrop-blur-md px-4 py-2 rounded-xl shadow-glass-sm flex items-center gap-2 whitespace-nowrap z-10">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-text-primary font-medium">
              {formatDuration(recordingDuration)}
            </span>
            <span className="text-xs text-text-tertiary">Click to stop</span>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-glass backdrop-blur-md px-4 py-2 rounded-xl shadow-glass-sm z-10">
            <span className="text-xs text-text-primary">Transcribing...</span>
          </div>
        )}

        {/* Send or Voice Button */}
        {hasText ? (
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="absolute right-2 bottom-2.5 w-8 h-8 rounded-xl bg-accent-orange hover:bg-accent-orange-dark disabled:bg-accent-orange/30 disabled:text-white/50 flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-sm"
          >
            <SendIcon className="w-4 h-4 text-white" />
          </button>
        ) : (
          <button
            onClick={handleVoiceButtonClick}
            disabled={disabled || isProcessing}
            className={`absolute right-2 bottom-2.5 w-8 h-8 rounded-xl flex items-center justify-center transition-all select-none ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-text-quaternary hover:bg-text-tertiary'
            } disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
            title={isRecording ? 'Click to stop recording' : 'Click to record'}
          >
            {isProcessing ? (
              <LoadingIcon className="w-4 h-4 text-white" />
            ) : (
              <MicrophoneIcon className="w-4 h-4 text-white" />
            )}
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="fixed top-4 left-4 right-4 bg-red-50/95 backdrop-blur-md px-4 py-3 rounded-xl shadow-glass-sm z-50">
          <div className="flex items-start gap-2">
            <span className="text-xs text-red-700 flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 text-xs flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
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
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"
      />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}
