import { create } from 'zustand';
import { Message, Conversation, ProductCard } from '../types';
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

    // Add loading message
    const loadingMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true,
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
      console.log('[ChatStore] Sending message:', content);
      console.log('[ChatStore] ConversationId:', conversationId);
      console.log('[ChatStore] PageContext:', state.pageContext);

      // Call real API
      const response = await api.sendMessage({
        message: content,
        conversationId: conversationId !== state.activeConversationId ? undefined : conversationId,
        pageContext: state.pageContext || undefined,
      });

      console.log('[ChatStore] API response received:', {
        messageLength: response.message?.length,
        productsCount: response.products?.length,
        conversationId: response.conversationId,
      });

      // Map API response to ProductCard format
      console.log('[ChatStore] Mapping products. Raw products:', response.products);
      const products: ProductCard[] = response.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        price: p.price,
        aiRating: p.aiRating || 0,
        matchScore: p.matchScore || 0, // Query relevance score
        confidence: p.confidence || 0,
        pros: p.pros,
        cons: p.cons,
        affiliateUrl: p.affiliateUrl,
        retailer: p.retailer,
        isSponsored: p.isSponsored,
      }));

      console.log('[ChatStore] Mapped products:', products.length, products.map(p => p.name));

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        timestamp: Date.now(),
        products: products.length > 0 ? products : undefined,
      };

      console.log('[ChatStore] Assistant message created:', {
        hasProducts: !!assistantMessage.products,
        productsCount: assistantMessage.products?.length,
      });

      // Update with server response and potentially new conversationId
      set((state) => ({
        isLoading: false,
        activeConversationId: response.conversationId || conversationId,
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                id: response.conversationId || conv.id,
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
