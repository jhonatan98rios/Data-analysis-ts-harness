import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ChartSpec } from '@/lib/tools/plot';
import { LANG_NAME, type Lang } from '@/lib/i18n';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

function buildToolsManual(tools?: StructuredToolInterface[]): string {
  if (!tools?.length) return '';

  const entries = tools.map((t) => {
    const schema = (t as { schema?: { shape?: Record<string, unknown> } }).schema;
    const params = schema?.shape
      ? Object.keys(schema.shape).join(', ')
      : 'none';
    return [
      `### \`${t.name}\``,
      t.description,
      `**Parameters:** ${params}`,
    ].join('\n');
  });

  return `\n\n## 🛠 Available tools\n\n${entries.join('\n\n---\n\n')}`;
}

function buildSystemPrompt(
  files?: UploadedFile[],
  tools?: StructuredToolInterface[],
  lang: Lang = 'pt-br',
): string {
  let prompt = `You are the Data Analysis Harness, a data analyst for small businesses and entrepreneurs.
Your goal: help the user understand their data, find opportunities to increase profit and reduce operational costs.

## ⛔ CRITICAL RULE — NO-GUESSING PROTOCOL

**YOU MUST NEVER, UNDER ANY CIRCUMSTANCE, INVENT OR ESTIMATE NUMBERS.**

This includes:
- Sums, totals, averages, percentages, counts
- Minimums, maximums, rankings, numeric comparisons
- Any value that depends on the loaded data

If a question involves ANY number about the data, you MUST:
1. Call the appropriate tool.
2. Wait for the result.
3. Only then answer with the exact value returned by the tool.

Answering with an estimated or invented number IS FORBIDDEN. Prefer saying "I need to check the data" over guessing.

## 📊 How to generate charts

**Grouped bars (two dimensions):**
When the user asks for "X by Y over Z" or "X grouped by Y", follow this flow:
1. FIRST call \`pivot(rowColumn="Z", columnColumn="Y", valueColumn="X", operation="sum")\`
2. THEN call \`plot(chartType="bar", xKey="Z", yKeys=<columns returned by pivot>, data=<pivot.data>)\`

Example: "Sales by category in each month"
→ pivot(rowColumn="date", columnColumn="category", valueColumn="revenue", operation="sum")
→ plot(chartType="bar", xKey="date", yKeys=["Electronics","Furniture"], data=...)

**Single-dimension charts:**
Use group_by, pareto, trend, etc. and pass the result straight into \`plot\`.

**Variations:**
- \`horizontal: true\` → horizontal bars (long names)
- \`stacked: true\` → stacked bars/areas
- \`donut: true\` → donut chart
- \`dual_axis\` + \`lineYKey\` → bar + line overlay

## General rules:
- If the user has not uploaded a file yet, instruct them to upload one
- After upload, call \`data_profile\` BEFORE any answer about the data
- After any numeric analysis, OFFER to generate a chart with the \`plot\` tool (see the 📊 section above)
- Use Markdown for tables and lists
- Be concise and direct`;

  prompt += buildToolsManual(tools);

  if (files?.length) {
    const fileList = files
      .map((f) => {
        const sizeMb = (f.size / 1024 / 1024).toFixed(2);
        let preview = '';
        if (f.type.includes('csv') || f.type.includes('json') || f.name.endsWith('.csv')) {
          try {
            const text = Buffer.from(f.data, 'base64').toString('utf-8').slice(0, 300);
            preview = `\n  Preview (first 300 chars):\n  ${text}`;
          } catch {
            // binary file or decode error, skip preview
          }
        }
        return `- ${f.name} (${f.type}, ${sizeMb} MB)${preview}`;
      })
      .join('\n');

    prompt += `\n\n## Files available for analysis:\n${fileList}`;
  } else {
    prompt +=
      '\n\n## Current status:\nNo file has been uploaded yet. Instruct the user to upload one.';
  }

  // ponytail: única parte variável por idioma — sempre no fim do system prompt,
  // que permanece 100% em inglês.
  prompt += `\n\n## Output language\nRespond in **${LANG_NAME[lang]}**.`;

  return prompt;
}

// ponytail: lidos uma vez por instância — usados no chat e no trace (provenance)
export const MODEL_NAME = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
// thinking enabled via model_kwargs, toggle with DEEPSEEK_THINKING=false
export const THINKING_ENABLED = process.env.DEEPSEEK_THINKING !== 'false';
export const TEMPERATURE = 0.7;

function createDeepSeekChat(): ChatOpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const enableThinking = THINKING_ENABLED;

  return new ChatOpenAI({
    modelName: MODEL_NAME,
    apiKey,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    streaming: true,
    temperature: TEMPERATURE,
    modelKwargs: enableThinking ? { thinking: { type: 'enabled' } } : undefined,
  });
}

export interface StreamToken {
  type: 'token' | 'thinking' | 'chart';
  text?: string;
  chart?: ChartSpec;
}

export interface StreamTrace {
  messages: BaseMessage[];
}

// ponytail: max 5 tool-call loops, add config if needed
const MAX_TOOL_LOOPS = 5;

export async function* streamResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
  files?: UploadedFile[],
  tools?: StructuredToolInterface[],
  trace?: StreamTrace,
  lang: Lang = 'pt-br',
): AsyncGenerator<StreamToken> {
  const chatBase = createDeepSeekChat();

  const toolMap = new Map(tools?.map((t) => [t.name, t]) ?? []);
  const chat = toolMap.size > 0 ? chatBase.bindTools(tools!) : chatBase;

  const langchainMessages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(files, tools, lang)),
    ...messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  // ponytail: o array é mutado in-place pelo loop — o trace lê o estado final
  // depois do stream fechar, sem precisar de callback por turno.
  if (trace) trace.messages = langchainMessages;

  // Agentic loop: invoke, check tool calls, execute, repeat
  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const response = await chat.invoke(langchainMessages);
    const toolCalls = (response as AIMessage).tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const text = typeof response.content === 'string' ? response.content : '';
      // ponytail: retry empty final responses (model sometimes yields blank content)
      if (text.trim().length === 0) {
        langchainMessages.push(new HumanMessage('Continue.'));
        continue;
      }
      const reasoning = (
        response.additional_kwargs as Record<string, unknown> | undefined
      )?.reasoning_content as string | undefined;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        yield { type: 'thinking', text: reasoning };
      }
      if (text.length > 0) {
        // resposta final entra na trajectory (com reasoning) antes de sair
        langchainMessages.push(response);
        yield { type: 'token', text };
      }
      return;
    }

    // Execute tool calls
    langchainMessages.push(response);
    for (const tc of toolCalls) {
      const tool = toolMap.get(tc.name);
      if (!tool) {
        langchainMessages.push(
          new ToolMessage({
            content: `Error: tool "${tc.name}" not found.`,
            tool_call_id: tc.id ?? '',
          }),
        );
        continue;
      }
      try {
        const rawResult = await tool.invoke(tc.args);
        const resultStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);

        // Intercept plot tool: emit chart event, push only summary to model
        if (tc.name === 'plot') {
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.chart) {
              yield { type: 'chart', chart: parsed.chart as ChartSpec };
            }
            langchainMessages.push(
              new ToolMessage({
                content: parsed.summary ?? resultStr,
                tool_call_id: tc.id ?? '',
                name: tc.name,
              }),
            );
          } catch {
            langchainMessages.push(
              new ToolMessage({
                content: resultStr,
                tool_call_id: tc.id ?? '',
                name: tc.name,
              }),
            );
          }
        } else {
          langchainMessages.push(
            new ToolMessage({
              content: resultStr,
              tool_call_id: tc.id ?? '',
              name: tc.name,
            }),
          );
        }
      } catch (err) {
        langchainMessages.push(
          new ToolMessage({
            content: `Error running ${tc.name}: ${err instanceof Error ? err.message : 'unknown error'}`,
            tool_call_id: tc.id ?? '',
          }),
        );
      }
    }
  }

  // ponytail: fallback — max loops reached, stream whatever the model says now
  const finalStream = await chat.stream(langchainMessages);
  let acc = '';
  for await (const chunk of finalStream) {
    const text = chunk.content;
    if (typeof text === 'string' && text.length > 0) {
      acc += text;
      yield { type: 'token', text };
    }
  }
  if (acc.length > 0) langchainMessages.push(new AIMessage(acc));
}
