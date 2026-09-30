import { streamResponse, MODEL_NAME, TEMPERATURE, THINKING_ENABLED, type StreamTrace } from '@/lib/chat/stream';
import { saveTrace } from '@/lib/trace';
import { after } from 'next/server';
import { parseAndStore } from '@/lib/data/store';
import { createAggregateTool } from '@/lib/tools/aggregate';
import { createProfileTool } from '@/lib/tools/profile';
import { createValueCountsTool, createGroupByTool } from '@/lib/tools/grouping';
import { createTopNTool, createFilterTool, createParetoTool } from '@/lib/tools/ranking';
import { createComparePeriodsTool, createTrendTool } from '@/lib/tools/timeseries';
import { createCorrelationTool, createRatioTool } from '@/lib/tools/relation';
import { createCountByGroupTool, createDescribeConditionalTool, createPivotTool } from '@/lib/tools/advanced';
import { createPlotTool } from '@/lib/tools/plot';
import { checkFiles, checkPromptInjection, sanitizeInput, checkMessageLength } from '@/lib/guardrails';
import type { Lang } from '@/lib/i18n';

// ponytail: nodejs (não edge) porque o driver do MongoDB precisa de sockets TCP.
export const runtime = 'nodejs';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

export async function POST(req: Request) {
  // ponytail: CORS — echo origin back or * when absent. Enforcement is in middleware.
  const origin = req.headers.get('origin');
  const acao: string = origin || '*';
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      files?: UploadedFile[];
      tenantId?: string;
      sessionId?: string;
      lang?: Lang;
    };
    const lang: Lang = body.lang === 'en-us' ? 'en-us' : 'pt-br';

    if (!body.messages?.length) {
      return new Response('messages required', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': acao },
      });
    }

    // guardrails: file size + type
    if (body.files?.length) {
      const fileErr = checkFiles(body.files, lang);
      if (fileErr) {
        return new Response(JSON.stringify({ error: fileErr }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': acao },
        });
      }
    }

    // guardrails: prompt injection + message length + XSS on the last user message
    const lastUserMsg = body.messages.filter((m) => m.role === 'user').at(-1);
    if (lastUserMsg) {
      const lenErr = checkMessageLength(lastUserMsg.content, lang);
      if (lenErr) {
        return new Response(JSON.stringify({ error: lenErr }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': acao },
        });
      }
      const injectionErr = checkPromptInjection(lastUserMsg.content, lang);
      if (injectionErr) {
        return new Response(JSON.stringify({ error: injectionErr }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': acao },
        });
      }
      // mutate: sanitize the content in-place before it hits the LLM
      lastUserMsg.content = sanitizeInput(lastUserMsg.content);
    }

    // Parse uploaded files into the data store
    const tenantId = body.tenantId || 'default';
    if (body.files?.length) {
      parseAndStore(tenantId, body.files);
    }

    // Create tools bound to this tenant's data
    const tools = [
      createProfileTool(tenantId),
      createAggregateTool(tenantId),
      createValueCountsTool(tenantId),
      createGroupByTool(tenantId),
      createTopNTool(tenantId),
      createFilterTool(tenantId),
      createParetoTool(tenantId),
      createComparePeriodsTool(tenantId),
      createTrendTool(tenantId),
      createCorrelationTool(tenantId),
      createRatioTool(tenantId),
      createCountByGroupTool(tenantId),
      createDescribeConditionalTool(tenantId),
      createPivotTool(tenantId),
      createPlotTool(),
    ];

    const encoder = new TextEncoder();

    // ponytail: coletor mutável — o generator escreve a trajectory completa
    // (system + tools + reasoning + tool calls + resposta) dentro dele.
    const trace: StreamTrace = { messages: [] };
    let traceError: string | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const st of streamResponse(body.messages, body.files, tools, trace, lang)) {
            if (st.type === 'chart' && st.chart) {
              enqueue({ chart: st.chart });
            } else if (st.type === 'thinking') {
              enqueue({ thinking: st.text });
            } else {
              enqueue({ token: st.text });
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'stream error';
          traceError = msg;
          enqueue({ error: msg });
          controller.close();
        }
      },
    });

    // Roda depois do response fechar: não adiciona latência ao chat.
    after(() =>
      saveTrace({
        trace,
        sessionId: body.sessionId,
        tenantId,
        model: MODEL_NAME,
        tools,
        latencyMs: Date.now() - startedAt,
        temperature: TEMPERATURE,
        thinking: THINKING_ENABLED,
        error: traceError,
        source: 'web',
      }),
    );

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': acao,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': acao },
    });
  }
}
