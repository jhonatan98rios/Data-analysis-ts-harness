'use client';

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartCard } from '@/components/chart-card';
import type { ChartSpec } from '@/lib/tools/plot';
import { checkFileSize, checkFileType, checkPromptInjection } from '@/lib/guardrails';

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
  charts?: ChartSpec[];
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

    // guardrails: file size + type
    const sizeErr = checkFileSize(file);
    if (sizeErr) { alert(sizeErr); e.target.value = ''; return; }
    const typeErr = checkFileType(file);
    if (typeErr) { alert(typeErr); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string).split(',')[1];
      setCurrentFile({ name: file.name, type: file.type, size: file.size, data });
    };
    reader.readAsDataURL(file);
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
      body: JSON.stringify({ messages: history, files, tenantId }),
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
          if (parsed.token) {
            replyText += parsed.token;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId ? { ...m, text: replyText, time: now() } : m,
              ),
            );
          }
          if (parsed.chart) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId
                  ? { ...m, charts: [...(m.charts || []), parsed.chart], time: now() }
                  : m,
              ),
            );
          }
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

    // guardrails: prompt injection check
    if (text) {
      const injectionErr = checkPromptInjection(text);
      if (injectionErr) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: 'assistant', text: injectionErr, time: now() },
        ]);
        return;
      }
    }

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

  const isStreamingText = (m: Message) =>
    streaming && m.role === 'assistant' && m.id === messages[messages.length - 1]?.id;

  return (
    <>
      <style>{`
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { font-weight: 600; margin: 0.5em 0 0.25em; }
        .markdown-body h1 { font-size: 1.1em; }
        .markdown-body h2 { font-size: 1.05em; }
        .markdown-body h3 { font-size: 1em; }
        .markdown-body p { margin: 0.25em 0; }
        .markdown-body ul, .markdown-body ol { padding-left: 1.2em; margin: 0.25em 0; }
        .markdown-body li { margin: 0.1em 0; }
        .markdown-body code { background: rgba(0,0,0,0.06); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
        .dark .markdown-body code { background: rgba(255,255,255,0.08); }
        .markdown-body pre { background: rgba(0,0,0,0.04); padding: 0.5em; border-radius: 6px; overflow-x: auto; margin: 0.25em 0; }
        .dark .markdown-body pre { background: rgba(255,255,255,0.04); }
        .markdown-body pre code { background: none; padding: 0; }
        .markdown-body table { border-collapse: collapse; margin: 0.25em 0; width: 100%; font-size: 0.85em; }
        .markdown-body th, .markdown-body td { border: 1px solid rgba(0,0,0,0.1); padding: 0.3em 0.55em; text-align: left; }
        .dark .markdown-body th, .dark .markdown-body td { border-color: rgba(255,255,255,0.1); }
        .markdown-body th { background: rgba(0,0,0,0.04); font-weight: 600; }
        .dark .markdown-body th { background: rgba(255,255,255,0.04); }
        .markdown-body blockquote { border-left: 3px solid rgba(0,0,0,0.15); margin: 0.25em 0; padding-left: 0.6em; color: rgba(0,0,0,0.5); }
        .dark .markdown-body blockquote { border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.5); }
        .markdown-body strong { font-weight: 600; }
        .markdown-body a { color: #4f46e5; text-decoration: underline; }
        .dark .markdown-body a { color: #818cf8; }
      `}</style>

      <div className="flex flex-col flex-1 relative bg-slate-50/80 dark:bg-neutral-950/90">
        {/* mesh gradient behind everything */}
        <div className="absolute inset-0 bg-mesh pointer-events-none" />

        {/* header — strong glass */}
        <header className="relative z-10 flex items-center gap-3 glass-strong px-4 py-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-medium uppercase shadow-inner">
            {tenantId[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{tenantId}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {streaming ? 'digitando…' : 'online'}
            </p>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
            ⚡ 14 tools
          </div>
        </header>

        {/* messages */}
        <div className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 dark:from-indigo-500/15 dark:to-violet-500/15 flex items-center justify-center mb-4">
                <svg viewBox="0 0 24 24" width="28" height="28" className="fill-indigo-500/60">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                Envie um arquivo CSV, Excel ou JSON para começar a analisar seus dados.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
              style={{ animationDelay: i === messages.length - 1 ? '0ms' : '0ms' }}
            >
              <div
                className={`relative max-w-[90%] sm:max-w-[75%] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-500 dark:bg-indigo-600 text-white rounded-2xl rounded-br-md'
                    : 'glass text-slate-800 dark:text-slate-200 rounded-2xl rounded-bl-md'
                }`}
              >
                {m.file && (
                  <div className="mb-1.5 flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg px-2.5 py-1.5 text-xs">
                    <svg viewBox="0 0 24 24" width="14" height="14" className="fill-current shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                    </svg>
                    <span className="truncate">{m.file.name}</span>
                    <span className="text-white/60 shrink-0">{formatSize(m.file.size)}</span>
                  </div>
                )}
                {m.text &&
                  (m.role === 'assistant' ? (
                    <div className="markdown-body text-[15px] leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ children }) => (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table>{children}</table>
                            </div>
                          ),
                        }}
                      >
                        {m.text || (isStreamingText(m) ? ' ' : '')}
                      </ReactMarkdown>
                      {/* typing indicator — shown when streaming still active and we're the last assistant msg */}
                      {isStreamingText(m) && !m.text && (
                        <div className="flex gap-1 py-1">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-indigo-400 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-indigo-400 typing-dot" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  ))}
                {m.charts?.map((chart) => (
                  <ChartCard key={chart.id} spec={chart} />
                ))}
                <span className={`block text-right text-[10px] mt-1 ${
                  m.role === 'user' ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {m.time}
                </span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* file chip above input */}
        {currentFile && (
          <div className="relative z-10 mx-3 mb-1 flex items-center gap-2 glass-strong rounded-xl px-3 py-2 text-sm">
            <svg viewBox="0 0 24 24" width="16" height="16" className="fill-indigo-500 dark:fill-indigo-400 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
            </svg>
            <span className="truncate flex-1 text-slate-700 dark:text-slate-200">{currentFile.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{formatSize(currentFile.size)}</span>
            <button onClick={removeFile} className="text-slate-300 dark:text-slate-600 hover:text-red-500 shrink-0" aria-label="remover arquivo">
              <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>
          </div>
        )}

        {/* input bar — strong glass */}
        <form
          onSubmit={send}
          className="relative z-10 flex items-center gap-2 glass-strong px-3 py-2.5 shrink-0 mx-2 mb-2 rounded-2xl"
        >
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
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
            aria-label="anexar arquivo"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" className="fill-current">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>

          <div className="flex-1 flex items-center bg-white/60 dark:bg-white/[0.06] rounded-full px-4 py-2.5 border border-white/30 dark:border-white/[0.06]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre seus dados…"
              className="flex-1 bg-transparent text-[15px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() && !currentFile}
            className="w-9 h-9 rounded-full bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center shrink-0 hover:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-30 transition-all"
            aria-label="enviar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" className="fill-white">
              <path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
