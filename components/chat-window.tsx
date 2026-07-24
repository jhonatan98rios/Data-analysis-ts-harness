'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

export function ChatWindow({ tenantId }: { tenantId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = { id: Date.now(), role: 'user', text };
    const reply: Message = {
      id: Date.now() + 1,
      role: 'assistant',
      text: `[placeholder] eco: "${text}"`,
    };

    setMessages((prev) => [...prev, userMsg, reply]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500">
        tenant: <span className="font-medium text-zinc-800 dark:text-zinc-200">{tenantId}</span>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-zinc-400 mt-12">send a message to start.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <form
        onSubmit={send}
        className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask something..."
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-opacity"
        >
          send
        </button>
      </form>
    </div>
  );
}
