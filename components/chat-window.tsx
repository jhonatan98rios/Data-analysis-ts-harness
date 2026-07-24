'use client';

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  file?: UploadedFile;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatWindow({ tenantId }: { tenantId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string).split(',')[1]; // strip data:... prefix
      setCurrentFile({ name: file.name, type: file.type, size: file.size, data });
    };
    reader.readAsDataURL(file);

    // reset so same file can be re-selected
    e.target.value = '';
  };

  const removeFile = () => setCurrentFile(null);

  const streamChat = async (
    history: { role: 'user' | 'assistant'; content: string }[],
    files?: UploadedFile[],
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, files }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let replyText = '';

    const replyId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: replyId, role: 'assistant', text: '', time: now() },
    ]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          // ponytail: thinking tokens ignored in UI, only token builds visible text
          if (parsed.token) {
            replyText += parsed.token;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId ? { ...m, text: replyText, time: now() } : m,
              ),
            );
          }
          // thinking tokens: silently consumed, not rendered
        } catch {
          // skip malformed chunks
        }
      }
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    const hasInput = text || currentFile;
    if (!hasInput || streaming) return;

    const file = currentFile;
    setCurrentFile(null);

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      text: text || (file ? `[Arquivo enviado: ${file.name}]` : ''),
      time: now(),
      file: file ?? undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    // ponytail: send current file + any past files referenced in messages
    const allFiles = [userMsg, ...messages]
      .filter((m) => m.file)
      .map((m) => m.file!);

    try {
      await streamChat(history, allFiles.length > 0 ? allFiles : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'stream error';
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', text: `Error: ${msg}`, time: now() },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 relative bg-[#efeae2] dark:bg-[#0b141a]">
      {/* chat bg pattern */}
      <div
        className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04] pointer-events-none"
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
            envie um arquivo ou mensagem para começar.
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
              {m.file && (
                <div className="mb-1 flex items-center gap-2 bg-black/10 rounded px-2 py-1 text-xs">
                  <svg viewBox="0 0 24 24" width="14" height="14" className="fill-current shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                  </svg>
                  <span className="truncate">{m.file.name}</span>
                  <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                    {formatSize(m.file.size)}
                  </span>
                </div>
              )}
              {m.text && <p className="pr-10 whitespace-pre-wrap">{m.text}</p>}
              <span className="absolute bottom-1 right-2 text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {m.time}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* file chip above input */}
      {currentFile && (
        <div className="relative z-10 mx-3 mb-1 flex items-center gap-2 bg-[#e1f5fe] dark:bg-[#1a3340] rounded-lg px-3 py-1.5 text-sm">
          <svg viewBox="0 0 24 24" width="16" height="16" className="fill-[#075e54] dark:fill-[#25d366] shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
          </svg>
          <span className="truncate flex-1">{currentFile.name}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatSize(currentFile.size)}
          </span>
          <button onClick={removeFile} className="text-zinc-400 hover:text-red-500 shrink-0" aria-label="remover arquivo">
            <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>
      )}

      {/* input */}
      <form
        onSubmit={send}
        className="relative z-10 flex items-center gap-2 bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2 shrink-0"
      >
        {/* file attach button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.parquet,.tsv,.txt"
          onChange={handleFileChange}
          className="hidden"
          aria-label="upload file"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-zinc-500 hover:text-[#075e54] transition-colors"
          aria-label="anexar arquivo"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" className="fill-current">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
          </svg>
        </button>

        <div className="flex-1 flex items-center bg-white dark:bg-[#2a3942] rounded-full px-4 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="digite uma mensagem..."
            className="flex-1 bg-transparent text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() && !currentFile}
          className="w-10 h-10 rounded-full bg-[#075e54] flex items-center justify-center shrink-0 hover:bg-[#056c5e] disabled:opacity-30 transition-opacity"
          aria-label="enviar"
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
