'use client';

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartCard } from '@/components/chart-card';
import { SessionDrawer } from '@/components/session-drawer';
import type { ChartSpec } from '@/lib/tools/plot';
import { loadSession, saveSession, upsertMeta, type SessionMessage } from '@/lib/sessions';
import { checkFileSize, checkFileType, checkPromptInjection, sanitizeInput } from '@/lib/guardrails';
import { t, type Lang } from '@/lib/i18n';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

type Message = SessionMessage & { file?: UploadedFile }; // runtime: file has data, persisted: file is SessionFile without data

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface DemoDataset {
  file: string;
  emoji: string;
  content: Record<Lang, { title: string; description: string; question: string }>;
}

// Datasets fictícios em public/demo/. O CSV é buscado e encaixado no mesmo fluxo
// de upload — nunca vai pra IA, só pro contexto das tools.
// public/demo/en-us/ tem os mesmos dados com o cabeçalho em inglês.
const DEMO_DATASETS: DemoDataset[] = [
  {
    file: 'vendas.csv',
    emoji: '📈',
    content: {
      'pt-br': {
        title: 'Vendas & Lucro',
        description: 'Pedidos do ano com receita, custo e lucro por produto, canal e cliente.',
        question: 'Analise estes dados de vendas e me mostre os principais insights para aumentar o lucro.',
      },
      'en-us': {
        title: 'Sales & Profit',
        description: 'Yearly orders with revenue, cost and profit by product, channel and customer.',
        question: 'Analyze this sales data and show me the main insights to increase profit.',
      },
    },
  },
  {
    file: 'marketing.csv',
    emoji: '📣',
    content: {
      'pt-br': {
        title: 'Marketing & ROI',
        description: 'Investimento e retorno de cada canal e campanha.',
        question: 'Analise o retorno de cada canal de marketing e me diga onde devo investir mais e onde devo cortar.',
      },
      'en-us': {
        title: 'Marketing & ROI',
        description: 'Investment and return for each channel and campaign.',
        question: 'Analyze the return of each marketing channel and tell me where I should invest more and where I should cut.',
      },
    },
  },
  {
    file: 'producao.csv',
    emoji: '🏭',
    content: {
      'pt-br': {
        title: 'Produção & Desperdício',
        description: 'Produção por linha e turno com refugo e horas paradas.',
        question: 'Analise a produção e me mostre onde estou perdendo mais com desperdício e paradas de máquina.',
      },
      'en-us': {
        title: 'Production & Waste',
        description: 'Production by line and shift with defects and downtime hours.',
        question: 'Analyze the production and show me where I am losing the most with waste and machine downtime.',
      },
    },
  },
  {
    file: 'clientes.csv',
    emoji: '👥',
    content: {
      'pt-br': {
        title: 'Clientes & Churn',
        description: 'Base de clientes com LTV, NPS, suporte e churn.',
        question: 'Analise minha base de clientes e me mostre como reduzir o churn e reter os melhores clientes.',
      },
      'en-us': {
        title: 'Customers & Churn',
        description: 'Customer base with LTV, NPS, support and churn.',
        question: 'Analyze my customer base and show me how to reduce churn and retain the best customers.',
      },
    },
  },
];

// base64 do conteúdo UTF-8, igual ao que o FileReader produz num upload real
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function ChatWindow({ sessionId, tenantId }: { sessionId: string; tenantId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('pt-br');
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // load session from IndexedDB whenever the session changes.
  // ponytail: sempre sobrescreve as mensagens (mesmo com []), senão a sessão nova
  // herda mensagens/arquivos da anterior e o store do servidor fica com o dado antigo.
  useEffect(() => {
    let cancelled = false;
    loadSession(sessionId).then((saved) => {
      if (cancelled) return;
      setMessages(saved ? (saved.messages as Message[]) : []);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  // idioma persistido + atributo lang do documento
  useEffect(() => {
    const saved = localStorage.getItem('dah-lang');
    const apply = () => {
      if (saved === 'en-us' || saved === 'pt-br') setLang(saved);
    };
    apply();
  }, []);
  useEffect(() => {
    localStorage.setItem('dah-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // ponytail: persist after each message change (debounced by React batching)
  useEffect(() => {
    if (messages.length === 0) return;
    const persisted: SessionMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      time: m.time,
      file: m.file,
      charts: m.charts,
    }));
    const lastUser = messages.filter((m) => m.role === 'user').at(-1);
    Promise.all([
      saveSession(sessionId, { messages: persisted }),
      upsertMeta(sessionId, lastUser?.text?.slice(0, 80) ?? ''),
    ]).catch(() => {}); // ponytail: IndexedDB errors are non-critical for UX
  }, [messages, sessionId]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // guardrails: file size + type
    const sizeErr = checkFileSize(file, lang);
    if (sizeErr) { alert(sizeErr); e.target.value = ''; return; }
    const typeErr = checkFileType(file, lang);
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
      body: JSON.stringify({ messages: history, files, tenantId, sessionId, lang }),
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

  // envia uma mensagem já montada pelo mesmo fluxo (upload incluso)
  const runChat = async (userMsg: Message) => {
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    // ordem cronológica: o último arquivo é o mais recente. O store do servidor
    // guarda só um dataset por tenant (parseAndStore sobrescreve), então o mais
    // novo precisa vir por último — senão um upload antigo vence o atual.
    const allFiles = [...messages, userMsg]
      .filter((m) => m.file)
      .map((m) => m.file!);

    try {
      await streamChat(history, allFiles.length > 0 ? allFiles : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'stream error';
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', text: t(lang, 'errorPrefix', { msg }), time: now() },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    const hasInput = text || currentFile;
    if (!hasInput || streaming) return;

    // guardrails: prompt injection + XSS
    const safeText = text ? sanitizeInput(text) : text;
    if (safeText) {
      const injectionErr = checkPromptInjection(safeText, lang);
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
      text: safeText || (file ? t(lang, 'fileSent', { name: file.name }) : ''),
      time: now(),
      file: file ?? undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    await runChat(userMsg);
  };

  const handleDemoClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const demo = DEMO_DATASETS.find((d) => d.file === e.currentTarget.dataset.file);
    if (demo) void loadDemo(demo);
  };

  // simula um upload: busca o CSV de exemplo e o envia pelo mesmo caminho
  const loadDemo = async (demo: DemoDataset) => {
    if (streaming || demoLoading) return;
    setDemoLoading(demo.file);
    try {
      const dir = lang === 'en-us' ? 'en-us/' : '';
      const res = await fetch(`/demo/${dir}${demo.file}`);
      if (!res.ok) throw new Error(t(lang, 'demoNotFound', { file: demo.file }));
      const text = await res.text();
      const file: UploadedFile = {
        name: demo.file,
        type: 'text/csv',
        size: new TextEncoder().encode(text).length,
        data: toBase64(text),
      };
      const userMsg: Message = {
        id: Date.now(),
        role: 'user',
        text: demo.content[lang].question,
        time: now(),
        file,
      };
      setMessages((prev) => [...prev, userMsg]);
      await runChat(userMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t(lang, 'unknownError');
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', text: t(lang, 'demoLoadError', { msg }), time: now() },
      ]);
    } finally {
      setDemoLoading(null);
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

      <SessionDrawer currentId={sessionId} open={drawerOpen} onClose={() => setDrawerOpen(false)} lang={lang} />

      <div className="flex flex-col flex-1 relative bg-slate-50/80 dark:bg-neutral-950/90">
        {/* mesh gradient behind everything */}
        <div className="absolute inset-0 bg-mesh pointer-events-none" />

        {/* header — sticky glass. z-30: precisa ficar acima das mensagens
            (mesmo z-index antes deixava o conteúdo rolar por cima e bloquear o clique). */}
        <header className="relative z-30 sticky top-0 flex items-center gap-3 glass-strong px-4 py-3">
          {/* hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors shrink-0"
            aria-label={t(lang, 'openSessions')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" className="fill-current">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {sessionId.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
            ⚡ 14 tools
          </div>
          {/* language toggle */}
          <button
            onClick={() => setLang(lang === 'pt-br' ? 'en-us' : 'pt-br')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
            aria-label={t(lang, 'changeLanguage')}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" className="fill-current" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.7 15.7 0 0 0-1.32-3.42A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14A7.96 7.96 0 0 1 4 12c0-.69.09-1.36.26-2h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.4 1.32 3.42A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.27-3.42A15.7 15.7 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.32 5.42c.54-1.02 1-2.17 1.32-3.42h2.95a8.03 8.03 0 0 1-4.27 3.42zM16.36 14a16.5 16.5 0 0 0 0-4h3.38c.17.64.26 1.31.26 2 0 .69-.09 1.36-.26 2h-3.38z" />
            </svg>
            {lang === 'pt-br' ? 'PT' : 'EN'}
          </button>
        </header>

        {/* messages */}
        <div className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-full py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 dark:from-indigo-500/15 dark:to-violet-500/15 flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" width="26" height="26" className="fill-indigo-500/60">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
                {t(lang, 'emptyTitle')}
              </h2>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                {t(lang, 'emptySubtitle')}
              </p>

              <div className="mt-5 w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_DATASETS.map((demo) => {
                  const loading = demoLoading === demo.file;
                  const copy = demo.content[lang];
                  return (
                    <button
                      key={demo.file}
                      type="button"
                      data-file={demo.file}
                      onClick={handleDemoClick}
                      disabled={!!demoLoading || streaming}
                      className="text-left glass rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-indigo-400/60 dark:hover:border-indigo-400/40 disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden>{demo.emoji}</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {copy.title}
                        </span>
                        {loading && (
                          <span className="ml-auto text-[11px] text-indigo-500 dark:text-indigo-400">
                            {t(lang, 'loading')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 leading-snug">
                        {copy.description}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-slate-400/80 dark:text-slate-600">
                {t(lang, 'demoDisclaimer')}
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
                  <ChartCard key={chart.id} spec={chart as ChartSpec} lang={lang} />
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

        <div className="relative z-30 sticky bottom-0 bg-gradient-to-t from-slate-50/80 via-slate-50/80 dark:from-neutral-950/90 dark:via-neutral-950/90 to-transparent pt-2 pb-2">

        {/* file chip above input */}
        {currentFile && (
          <div className="mx-3 mb-1 flex items-center gap-2 glass-strong rounded-xl px-3 py-2 text-sm">
            <svg viewBox="0 0 24 24" width="16" height="16" className="fill-indigo-500 dark:fill-indigo-400 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
            </svg>
            <span className="truncate flex-1 text-slate-700 dark:text-slate-200">{currentFile.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{formatSize(currentFile.size)}</span>
            <button onClick={removeFile} className="text-slate-300 dark:text-slate-600 hover:text-red-500 shrink-0" aria-label={t(lang, 'removeFile')}>
              <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>
          </div>
        )}

        {/* input bar — strong glass */}
        <form
          onSubmit={send}
          className="flex items-center gap-2 glass-strong px-3 py-2.5 mx-2 rounded-2xl"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json,.parquet,.tsv,.txt"
            onChange={handleFileChange}
            className="hidden"
            aria-label={t(lang, 'uploadFile')}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
            aria-label={t(lang, 'attachFile')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" className="fill-current">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>

          <div className="flex-1 flex items-center bg-white/60 dark:bg-white/[0.06] rounded-full px-4 py-2.5 border border-white/30 dark:border-white/[0.06]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(lang, 'inputPlaceholder')}
              className="flex-1 bg-transparent text-[15px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() && !currentFile}
            className="w-9 h-9 rounded-full bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center shrink-0 hover:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-30 transition-all"
            aria-label={t(lang, 'send')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" className="fill-white">
              <path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
            </svg>
          </button>
        </form>
        </div>
      </div>
    </>
  );
}
