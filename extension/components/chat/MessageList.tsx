import React from 'react';
import { Message } from '../../types';
import { MessageBubble } from './MessageBubble';
import { ProductCarousel } from '../products/ProductCarousel';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <div key={message.id} className="animate-fade-in">
          <MessageBubble message={message} />
          {message.products && message.products.length > 0 && (
            <div className="mt-3 px-5">
              <ProductCarousel products={message.products} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
