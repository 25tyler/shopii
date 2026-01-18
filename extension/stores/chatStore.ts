import { create } from 'zustand';
import { Message, Conversation, ProductCard, ResearchProgressEvent, ResearchSource } from '../types';
import { api } from '../services/api';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  pageContext: {
    url: string;
    title?: string;
    productName?: string;
    price?: string;
    imageUrl?: string;
    retailer?: string;
  } | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  createConversation: () => string;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  setPageContext: (context: ChatState['pageContext']) => void;
  clearError: () => void;
  initialize: () => Promise<void>;
  syncWithServer: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoading: false,
  error: null,
  pageContext: null,

  sendMessage: async (content: string) => {
    const state = get();
    let conversationId = state.activeConversationId;

    // Create new conversation if none active
    if (!conversationId) {
      conversationId = get().createConversation();
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Add user message optimistically
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: [...conv.messages, userMessage],
              updatedAt: Date.now(),
            }
          : conv
      ),
    }));

    // Add loading message with empty research sources
    const loadingMessageId = crypto.randomUUID();
    const loadingMessage: Message = {
      id: loadingMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true,
      researchSources: [],
    };

    set((state) => ({
      isLoading: true,
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: [...conv.messages, loadingMessage],
            }
          : conv
      ),
    }));

    try {
      console.log('[ChatStore] Sending message with SSE:', content);
      console.log('[ChatStore] ConversationId:', conversationId);
      console.log('[ChatStore] PageContext:', state.pageContext);

      // Get auth token
      const authResult = await chrome.storage.local.get(['authToken']);
      const token = authResult.authToken || null;

      // Build SSE URL
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = `${API_BASE_URL}/api/chat/message-stream`;

      // Use POST with fetch for SSE
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: content,
          conversationId: conversationId !== state.activeConversationId ? undefined : conversationId,
          pageContext: state.pageContext || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let finalMessage = '';
      let finalProducts: ProductCard[] = [];
      let finalConversationId = conversationId;
      let researchSummary: { totalSearches: number; totalSources: number } | undefined = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            console.log('[ChatStore SSE] Event:', eventType, data);

            if (eventType === 'progress') {
              // Update research sources
              const event = data as ResearchProgressEvent;

              // Handle research summary
              if (event.type === 'research_summary' && event.totalSearches && event.totalSources) {
                researchSummary = {
                  totalSearches: event.totalSearches,
                  totalSources: event.totalSources,
                };
              }

              set((state) => ({
                conversations: state.conversations.map((conv) =>
                  conv.id === conversationId
                    ? {
                        ...conv,
                        messages: conv.messages.map((msg) =>
                          msg.id === loadingMessageId
                            ? {
                                ...msg,
                                researchSources: updateResearchSources(msg.researchSources || [], event),
                              }
                            : msg
                        ),
                      }
                    : conv
                ),
              }));
            } else if (eventType === 'message') {
              finalMessage = data.message;
            } else if (eventType === 'products') {
              finalProducts = (data.products || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                imageUrl: p.imageUrl,
                price: p.price,
                aiRating: p.aiRating || 0,
                matchScore: p.matchScore || 0,
                confidence: p.confidence || 0,
                pros: Array.isArray(p.pros) ? p.pros : [],
                cons: Array.isArray(p.cons) ? p.cons : [],
                affiliateUrl: p.affiliateUrl,
                retailer: p.retailer,
                isSponsored: p.isSponsored || false,
              }));
            } else if (eventType === 'conversationId') {
              finalConversationId = data.conversationId || conversationId;
            } else if (eventType === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }

      console.log('[ChatStore SSE] Complete. Final message length:', finalMessage.length);
      console.log('[ChatStore SSE] Products count:', finalProducts.length);

      // Replace loading message with final response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalMessage,
        timestamp: Date.now(),
        products: finalProducts.length > 0 ? finalProducts : undefined,
        researchSummary,
      };

      set((state) => ({
        isLoading: false,
        activeConversationId: finalConversationId,
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                id: finalConversationId,
                messages: conv.messages.filter((m) => !m.isLoading).concat(assistantMessage),
                updatedAt: Date.now(),
                title:
                  conv.title === 'New Chat'
                    ? content.slice(0, 50) + (content.length > 50 ? '...' : '')
                    : conv.title,
              }
            : conv
        ),
      }));

      // Persist to local storage
      const updatedState = get();
      chrome.storage.local.set({ conversations: updatedState.conversations });
    } catch (error) {
      console.error('[ChatStore] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get response. Please try again.';

      set((state) => ({
        isLoading: false,
        error: errorMessage,
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: conv.messages.filter((m) => !m.isLoading),
              }
            : conv
        ),
      }));
    }
  },

  createConversation: () => {
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      activeConversationId: newConversation.id,
    }));

    return newConversation.id;
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
  },

  deleteConversation: async (id) => {
    // Try to delete on server
    try {
      await api.deleteConversation(id);
    } catch {
      // Continue with local delete even if server fails
    }

    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id);
      return {
        conversations: filtered,
        activeConversationId:
          state.activeConversationId === id ? filtered[0]?.id || null : state.activeConversationId,
      };
    });

    // Persist to local storage
    const updatedState = get();
    chrome.storage.local.set({ conversations: updatedState.conversations });
  },

  setPageContext: (context) => {
    set({ pageContext: context });
  },

  clearError: () => set({ error: null }),

  initialize: async () => {
    try {
      // First load from local storage for immediate display
      const result = await chrome.storage.local.get(['conversations']);
      set({
        conversations: result.conversations || [],
        activeConversationId: result.conversations?.[0]?.id || null,
      });

      // Then try to sync with server
      await get().syncWithServer();
    } catch (error) {
      console.error('Failed to initialize chat store:', error);
    }
  },

  syncWithServer: async () => {
    try {
      // Get conversations from server
      const serverConversations = await api.getConversations();

      if (serverConversations.length > 0) {
        // Merge server conversations with local
        const localConvs = get().conversations;
        const localIds = new Set(localConvs.map((c) => c.id));

        // Add any server conversations not in local
        const newConversations: Conversation[] = [];
        for (const serverConv of serverConversations) {
          if (!localIds.has(serverConv.id)) {
            // Fetch full conversation with messages
            const fullConv = await api.getConversation(serverConv.id);
            newConversations.push({
              id: fullConv.id,
              title: fullConv.title,
              messages: fullConv.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.createdAt).getTime(),
              })),
              createdAt: new Date(fullConv.createdAt).getTime(),
              updatedAt: new Date(fullConv.updatedAt).getTime(),
            });
          }
        }

        if (newConversations.length > 0) {
          set((state) => ({
            conversations: [...newConversations, ...state.conversations].sort(
              (a, b) => b.updatedAt - a.updatedAt
            ),
          }));

          // Persist merged conversations
          const updatedState = get();
          chrome.storage.local.set({ conversations: updatedState.conversations });
        }
      }
    } catch {
      // Silently fail - user might not be authenticated
    }
  },
}));

// Helper function to update research sources based on progress events
function updateResearchSources(
  sources: ResearchSource[],
  event: ResearchProgressEvent
): ResearchSource[] {
  const newSources = [...sources];

  if (event.type === 'search_start' && event.source) {
    // Add or update source as "searching"
    const existingIndex = newSources.findIndex((s) => s.name === event.source);
    if (existingIndex >= 0) {
      newSources[existingIndex] = {
        ...newSources[existingIndex],
        status: 'searching',
        timestamp: event.timestamp,
      };
    } else {
      newSources.push({
        name: event.source,
        status: 'searching',
        timestamp: event.timestamp,
      });
    }
  } else if (event.type === 'source_found' && event.source) {
    // Update source as "found" with count
    const existingIndex = newSources.findIndex((s) => s.name === event.source);
    if (existingIndex >= 0) {
      newSources[existingIndex] = {
        ...newSources[existingIndex],
        status: 'complete',
        count: event.count,
        timestamp: event.timestamp,
      };
    }
  }

  return newSources;
}
