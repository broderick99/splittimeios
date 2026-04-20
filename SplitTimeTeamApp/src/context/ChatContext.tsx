import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { ChatMessage } from '@/types';

interface CreateChatMessageInput {
  body?: string;
  image?: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  };
}

interface ChatContextValue {
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  sendMessage: (input: CreateChatMessageInput) => Promise<ChatMessage | null>;
  refreshMessages: (options?: { silent?: boolean }) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

async function parseResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function mapChatMessage(item: any): ChatMessage {
  return {
    id: String(item.id),
    teamId: String(item.teamId ?? item.team_id ?? ''),
    senderUserId: String(item.senderUserId ?? item.sender_user_id ?? ''),
    senderName: String(item.senderName ?? item.sender_name ?? ''),
    senderRole: (item.senderRole ?? item.sender_role ?? 'athlete') === 'coach' ? 'coach' : 'athlete',
    body: String(item.body ?? ''),
    imageUrl: item.imageUrl ?? item.image_url ?? null,
    createdAt: Date.parse(item.createdAt ?? item.created_at ?? '') || Date.now(),
  };
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { apiBaseUrl, session } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const teamId = session?.team?.id ?? null;

  const refreshMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!teamId || !apiBaseUrl || !session) {
      setMessages([]);
      return;
    }

    if (!options?.silent) {
      setIsLoadingMessages(true);
    }

    try {
      const response = await fetch(`${apiBaseUrl}/chat/messages`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await parseResponse(response);
      setMessages((Array.isArray(data) ? data : []).map(mapChatMessage));
    } finally {
      if (!options?.silent) {
        setIsLoadingMessages(false);
      }
    }
  }, [apiBaseUrl, session, teamId]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  const sendMessage = useCallback(
    async ({ body, image }: CreateChatMessageInput) => {
      if (!teamId || !apiBaseUrl || !session) {
        return null;
      }

      const trimmedBody = body?.trim() ?? '';
      const hasImage = Boolean(image);

      if (!trimmedBody && !hasImage) {
        return null;
      }

      let response: Response;

      if (image) {
        const formData = new FormData();
        if (trimmedBody) {
          formData.append('body', trimmedBody);
        }
        formData.append('image', {
          uri: image.uri,
          name: image.fileName ?? 'chat-photo.jpg',
          type: image.mimeType ?? 'image/jpeg',
        } as any);

        response = await fetch(`${apiBaseUrl}/chat/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
          body: formData,
        });
      } else {
        response = await fetch(`${apiBaseUrl}/chat/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            body: trimmedBody,
          }),
        });
      }

      const data = await parseResponse(response);
      const createdMessage = data ? mapChatMessage(data) : null;

      if (createdMessage) {
        setMessages((current) => {
          if (current.some((message) => message.id === createdMessage.id)) {
            return current;
          }

          return [...current, createdMessage].sort((left, right) => {
            if (left.createdAt !== right.createdAt) {
              return left.createdAt - right.createdAt;
            }

            return left.id.localeCompare(right.id);
          });
        });
      }

      return createdMessage;
    },
    [apiBaseUrl, session, teamId]
  );

  const value = useMemo(
    () => ({
      messages,
      isLoadingMessages,
      sendMessage,
      refreshMessages,
    }),
    [isLoadingMessages, messages, refreshMessages, sendMessage]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }

  return context;
}
