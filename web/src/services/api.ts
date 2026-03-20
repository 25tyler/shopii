const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error ${res.status}`);
  }

  return res.json();
}

export const api = {
  chat: {
    sendMessage: (body: {
      message: string;
      conversationId?: string;
      mode?: string;
    }) => request<{ response: string; conversationId: string }>('/chat/message', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  },

  auth: {
    signIn: (body: { email: string; password: string }) =>
      request<{ access_token: string; refresh_token: string }>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    getMe: () => request<{ id: string; email: string; name?: string }>('/auth/me'),
  },

  health: () => request<{ status: string }>('/health'),
};
