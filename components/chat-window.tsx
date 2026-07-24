'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

    const userMsg: Message = { id: Date.now(), role: 'user', text, time: now() };
    const reply: Message = {
      id: Date.now() + 1,
      role: 'assistant',
      text: `[placeholder] eco: "${text}"`,
      time: now(),
    };

    setMessages((prev) => [...prev, userMsg, reply]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a]">
      {/* chat bg pattern */}
      <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* header */}
      <header className="relative z-10 flex items-center gap-3 bg-[#075e54] px-4 py-2 text-white shrink-0">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-medium uppercase">
          {tenantId[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{tenantId}</p>
          <p className="text-xs text-white/60">online</p>
        </div>
      </header>

      {/* messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm mt-12">
            send a message to start.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`relative max-w-[75%] px-3 py-2 text-sm leading-snug shadow-sm ${
                m.role === 'user'
                  ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-sm'
                  : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tl-sm'
              }`}
            >
              <p className="pr-10">{m.text}</p>
              <span className="absolute bottom-1 right-2 text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {m.time}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <form
        onSubmit={send}
        className="relative z-10 flex items-center gap-2 bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2 shrink-0"
      >
        <div className="flex-1 flex items-center bg-white dark:bg-[#2a3942] rounded-full px-4 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="type a message..."
            className="flex-1 bg-transparent text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-10 h-10 rounded-full bg-[#075e54] flex items-center justify-center shrink-0 hover:bg-[#056c5e] disabled:opacity-30 transition-opacity"
          aria-label="send"
        >
          {/* send icon */}
          <svg viewBox="0 0 24 24" width="20" height="20" className="fill-white">
            <path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
