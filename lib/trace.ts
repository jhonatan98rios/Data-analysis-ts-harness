import { MongoClient, type Db } from 'mongodb';
import { isAIMessage, type BaseMessage } from '@langchain/core/messages';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import type { StructuredToolInterface } from '@langchain/core/tools';

// ── Shapes ─────────────────────────────────────────────────────────────────
// ponytail: formato = OpenAI chat verbatim (messages + tools em JSON Schema).
// É o que o SFTTrainer do TRL e os chat templates de Qwen3/Hermes consomem
// sem conversão. reasoning_content é o campo que vLLM/Qwen3 leem.

export type TraceRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TraceToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface TraceMessage {
  role: TraceRole;
  content: string;
  reasoning_content?: string;
  tool_calls?: TraceToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface TraceDoc {
  schemaVersion: 1;
  createdAt: Date;
  sessionId: string;
  turnId: string;
  tenantId: string;
  model: string;
  messages: TraceMessage[];
  tools: unknown[];
  toolsUsed: string[];
  meta: {
    latencyMs: number;
    rounds: number;
    toolCalls: number;
    thinking: boolean;
    temperature: number;
    status: 'ok' | 'error';
    error?: string;
    truncated: number;
    source: string;
  };
}

export interface TraceCollector {
  messages: BaseMessage[];
}

/** Truncagem de result de tool: evita docs gigantes e amostras inúteis. */
const MAX_TOOL_CHARS = 8000;

// ── Serialização (pura — testável sem banco) ───────────────────────────────

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : typeof b === 'object' && b && 'text' in b ? String((b as { text: unknown }).text) : ''))
      .join('');
  }
  return content == null ? '' : JSON.stringify(content);
}

export function toTraceMessages(messages: BaseMessage[]): {
  messages: TraceMessage[];
  truncated: number;
} {
  const out: TraceMessage[] = [];
  let truncated = 0;

  for (const m of messages) {
    const type = m.getType();

    if (type === 'human') {
      // ponytail: "Continue." é nudge injetado pelo retry de resposta vazia,
      // não é turno do usuário — não pode virar dado de treino.
      if (textOf(m.content).trim() === 'Continue.') continue;
      out.push({ role: 'user', content: textOf(m.content) });
    } else if (type === 'system') {
      out.push({ role: 'system', content: textOf(m.content) });
    } else if (type === 'ai') {
      const msg: TraceMessage = { role: 'assistant', content: textOf(m.content) };
      const reasoning = (m.additional_kwargs as Record<string, unknown> | undefined)?.reasoning_content;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        msg.reasoning_content = reasoning;
      }
      const calls = isAIMessage(m) ? m.tool_calls : undefined;
      if (calls?.length) {
        msg.tool_calls = calls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }));
      }
      out.push(msg);
    } else if (type === 'tool') {
      const raw = textOf(m.content);
      let content = raw;
      if (raw.length > MAX_TOOL_CHARS) {
        content = `${raw.slice(0, MAX_TOOL_CHARS)}\n…[truncado: ${raw.length} chars]`;
        truncated++;
      }
      const tool = m as unknown as { tool_call_id?: string; name?: string };
      out.push({
        role: 'tool',
        content,
        tool_call_id: tool.tool_call_id ?? '',
        ...(tool.name ? { name: tool.name } : {}),
      });
    }
  }

  return { messages: out, truncated };
}

// ── Doc + persistência ─────────────────────────────────────────────────────

export interface BuildTraceInput {
  trace: TraceCollector;
  sessionId?: string;
  tenantId: string;
  model: string;
  tools: StructuredToolInterface[];
  latencyMs: number;
  temperature: number;
  thinking: boolean;
  error?: string | null;
  source?: string;
  now?: Date;
}

export function buildTraceDoc(input: BuildTraceInput): TraceDoc {
  const { messages, truncated } = toTraceMessages(input.trace.messages);
  const toolCalls = messages.reduce((n, m) => n + (m.tool_calls?.length ?? 0), 0);
  const toolsUsed = [
    ...new Set(messages.flatMap((m) => m.tool_calls?.map((tc) => tc.function.name) ?? [])),
  ];

  return {
    schemaVersion: 1,
    createdAt: input.now ?? new Date(),
    sessionId: input.sessionId || 'anonymous',
    turnId: crypto.randomUUID(),
    tenantId: input.tenantId,
    model: input.model,
    messages,
    tools: input.tools.map((t) => convertToOpenAITool(t)),
    toolsUsed,
    meta: {
      // ponytail: rounds = turnos do assistant (cada um = 1 chamada ao LLM)
      latencyMs: input.latencyMs,
      rounds: messages.filter((m) => m.role === 'assistant').length,
      toolCalls,
      thinking: input.thinking,
      temperature: input.temperature,
      status: input.error ? 'error' : 'ok',
      ...(input.error ? { error: input.error } : {}),
      truncated,
      source: input.source ?? 'web',
    },
  };
}

const DB = 'dah';
const COLLECTION = 'traces';

// ponytail: client cacheado no globalThis — em serverless sobrevive entre
// invocações da mesma instância, e cada cold start reconecta.
const g = globalThis as unknown as { __dahMongo?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });
  const p = client.connect();
  // não cacheia conexão falha — próximo turno tenta de novo
  p.catch(() => {
    if (g.__dahMongo === p) g.__dahMongo = undefined;
  });
  g.__dahMongo = p;
  return p;
}

async function db(): Promise<Db> {
  const client = await (g.__dahMongo ?? connect());
  return client.db(process.env.MONGODB_DB || DB);
}

/** Nunca lança: telemetria não pode derrubar o chat. */
export async function saveTrace(input: BuildTraceInput): Promise<void> {
  try {
    const doc = buildTraceDoc(input);
    const database = await db();
    await database.collection<TraceDoc>(COLLECTION).insertOne(doc);
  } catch (err) {
    console.error('[trace] falha ao persistir trace:', err instanceof Error ? err.message : err);
  }
}
