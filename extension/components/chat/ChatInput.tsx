import React, { useState, useRef, useEffect } from 'react';
import { voiceService } from '../../services/voice';

interface ChatInputProps {
  onSend: (message: string) => void;
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
      onSend(trimmed);
      setValue('');
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

  return (
    <div className="relative">
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
