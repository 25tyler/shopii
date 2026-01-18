/**
 * Voice service for speech-to-text using Wispr Flow API
 */

const WISPR_API_KEY = import.meta.env.VITE_WHISPER_FLOW_API_KEY || 'fl-b4bc98aff5f372b3e7ecd38a58de60f2';
const WISPR_API_ENDPOINT = 'https://platform-api.wisprflow.ai/api/v1/dash/api';

export interface VoiceRecordingResult {
  text: string;
  duration: number;
}

export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /**
   * Request microphone permission and initialize recording
   */
  async requestMicrophonePermission(): Promise<boolean> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Optimal for Whisper
        }
      });
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);

      // Provide helpful error message
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please enable microphone permissions in your browser settings for this extension.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
      }
      throw new Error('Failed to access microphone. Please check your browser permissions.');
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (!this.stream) {
      await this.requestMicrophonePermission();
    }

    if (!this.stream) {
      throw new Error('No audio stream available');
    }

    this.audioChunks = [];

    // Create MediaRecorder with WAV format for better compatibility
    let options: MediaRecorderOptions = { mimeType: 'audio/wav' };

    // Fallback to webm if wav is not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/webm';
      }
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  /**
   * Stop recording and transcribe audio
   */
  async stopRecording(): Promise<VoiceRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      const startTime = Date.now();

      this.mediaRecorder.onstop = async () => {
        try {
          const duration = (Date.now() - startTime) / 1000;

          // Create audio blob from chunks
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

          // Convert to proper format and transcribe
          const text = await this.transcribeAudio(audioBlob);

          resolve({ text, duration });
        } catch (error) {
          reject(error);
        } finally {
          this.cleanup();
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Transcribe audio using Wispr Flow API (direct API key method)
   */
  private async transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
      // Convert audio blob to WAV format and then to base64
      const wavBlob = await this.convertToWav(audioBlob);
      const base64Audio = await this.blobToBase64(wavBlob);

      // Prepare request body according to Wispr Flow API spec
      const requestBody = {
        audio: base64Audio,
        language: ['en'],
        context: {
          app: {
            type: 'other'
          },
          dictionary_context: [],
          textbox_contents: {
            before_text: '',
            selected_text: '',
            after_text: ''
          }
        }
      };

      console.log('Sending transcription request to Wispr Flow...');
      console.log('Endpoint:', WISPR_API_ENDPOINT);
      console.log('Audio size (base64):', base64Audio.length, 'characters');
      console.log('Full API Key:', WISPR_API_KEY);
      console.log('API Key from env:', import.meta.env.VITE_WHISPER_FLOW_API_KEY);
      console.log('API Key length:', WISPR_API_KEY.length);
      console.log('Authorization header:', `Bearer ${WISPR_API_KEY}`);

      const response = await fetch(WISPR_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WISPR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Wispr Flow API error response:', errorText);
        console.error('Status:', response.status, response.statusText);

        let errorMessage = 'Transcription failed';
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Parsed error:', errorJson);
          errorMessage = errorJson.detail || errorJson.error?.message || errorJson.message || errorText;
        } catch {
          errorMessage = `${response.status}: ${response.statusText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Transcription result:', result);

      if (!result.text) {
        throw new Error('No transcription text received');
      }

      return result.text.trim();
    } catch (error) {
      console.error('Transcription error:', error);

      // Re-throw the original error message if it exists
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to transcribe audio. Please try again.');
    }
  }

  /**
   * Convert audio blob to WAV format at 16kHz
   */
  private async convertToWav(audioBlob: Blob): Promise<Blob> {
    try {
      // Decode audio data
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get audio data at 16kHz
      const wavBuffer = this.audioBufferToWav(audioBuffer);
      await audioContext.close();

      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error converting to WAV:', error);
      // Return original blob if conversion fails
      return audioBlob;
    }
  }

  /**
   * Convert AudioBuffer to WAV format
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = 1; // Mono
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const channelData = buffer.getChannelData(0);
    const samples = new Int16Array(channelData.length);

    // Convert float32 to int16
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const dataLength = samples.length * 2;
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Write audio data
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true);
    }

    return arrayBuffer;
  }

  /**
   * Convert Blob to base64 string
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove the data:audio/wav;base64, prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Cancel recording without transcribing
   */
  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.audioChunks = [];
    this.mediaRecorder = null;

    // Stop all tracks to release microphone
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  /**
   * Clean up on unmount
   */
  destroy(): void {
    this.cancelRecording();
    this.cleanup();
  }
}

// Singleton instance
export const voiceService = new VoiceService();
