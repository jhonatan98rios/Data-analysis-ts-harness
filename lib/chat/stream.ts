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
      : 'nenhum';
    return [
      `### \`${t.name}\``,
      t.description,
      `**Parâmetros:** ${params}`,
    ].join('\n');
  });

  return `\n\n## 🛠 Ferramentas disponíveis\n\n${entries.join('\n\n---\n\n')}`;
}

function buildSystemPrompt(
  files?: UploadedFile[],
  tools?: StructuredToolInterface[],
): string {
  let prompt = `Você é o Data Analysis Harness, um analista de dados para pequenas empresas e empreendedores.
Seu objetivo: ajudar o usuário a entender seus dados, encontrar oportunidades de aumentar o lucro e reduzir custos operacionais.

## ⛔ REGRA CRÍTICA — PROTOCOLO ANTI-CHUTE

**VOCÊ NUNCA, SOB NENHUMA HIPÓTESE, PODE INVENTAR OU ESTIMAR NÚMEROS.**

Isso inclui:
- Somas, totais, médias, percentuais, contagens
- Mínimos, máximos, rankings, comparações numéricas
- Qualquer valor que dependa dos dados carregados

Se uma pergunta envolve QUALQUER número sobre os dados, você DEVE:
1. Chamar a ferramenta apropriada.
2. Aguardar o resultado.
3. Só então responder com o valor exato retornado pela ferramenta.

Responder com um número estimado ou inventado É PROIBIDO. Prefira dizer "preciso consultar os dados" a chutar.

## 📊 Como gerar gráficos

**Barras agrupadas (duas dimensões):**
Quando o usuário pedir "X por Y ao longo de Z" ou "X agrupado por Y", siga este fluxo:
1. PRIMEIRO chame \`pivot(rowColumn="Z", columnColumn="Y", valueColumn="X", operation="sum")\`
2. DEPOIS chame \`plot(chartType="bar", xKey="Z", yKeys=<colunas retornadas pelo pivot>, data=<pivot.data>)\`

Exemplo: "Vendas por categoria em cada mês"
→ pivot(rowColumn="data", columnColumn="categoria", valueColumn="Vl_Total", operation="sum")
→ plot(chartType="bar", xKey="data", yKeys=["Eletrônicos","Móveis"], data=...)

**Gráficos de uma dimensão:**
Use group_by, pareto, trend, etc. e passe o resultado direto pro \`plot\`.

**Variações:**
- \`horizontal: true\` → barras horizontais (nomes longos)
- \`stacked: true\` → barras/áreas empilhadas
- \`donut: true\` → gráfico de rosca
- \`dual_axis\` + \`lineYKey\` → barra + linha sobrepostas

## Regras gerais:
- Sempre responda em **português**
- Se o usuário ainda não fez upload de arquivo, instrua-o a fazer upload
- Após upload, chame \`data_profile\` ANTES de qualquer resposta sobre os dados
- Após qualquer análise numérica, OFEREÇA gerar um gráfico com a tool \`plot\` (veja seção 📊 acima)
- Use Markdown para tabelas e listas
- Seja conciso e direto`;

  prompt += buildToolsManual(tools);

  if (files?.length) {
    const fileList = files
      .map((f) => {
        const sizeMb = (f.size / 1024 / 1024).toFixed(2);
        let preview = '';
        if (f.type.includes('csv') || f.type.includes('json') || f.name.endsWith('.csv')) {
          try {
            const text = Buffer.from(f.data, 'base64').toString('utf-8').slice(0, 300);
            preview = `\n  Preview (primeiros 300 chars):\n  ${text}`;
          } catch {
            // binary file or decode error, skip preview
          }
        }
        return `- ${f.name} (${f.type}, ${sizeMb} MB)${preview}`;
      })
      .join('\n');

    prompt += `\n\n## Arquivos disponíveis para análise:\n${fileList}`;
  } else {
    prompt +=
      '\n\n## Status atual:\nNenhum arquivo foi enviado ainda. Instrua o usuário a fazer upload.';
  }

  return prompt;
}

function createDeepSeekChat(): ChatOpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  // ponytail: thinking enabled via model_kwargs, toggle with DEEPSEEK_THINKING=false
  const enableThinking = process.env.DEEPSEEK_THINKING !== 'false';

  return new ChatOpenAI({
    modelName: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    streaming: true,
    temperature: 0.7,
    modelKwargs: enableThinking ? { thinking: { type: 'enabled' } } : undefined,
  });
}

export interface StreamToken {
  type: 'token' | 'thinking' | 'chart';
  text?: string;
  chart?: ChartSpec;
}

// ponytail: max 5 tool-call loops, add config if needed
const MAX_TOOL_LOOPS = 5;

export async function* streamResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
  files?: UploadedFile[],
  tools?: StructuredToolInterface[],
): AsyncGenerator<StreamToken> {
  const chatBase = createDeepSeekChat();

  const toolMap = new Map(tools?.map((t) => [t.name, t]) ?? []);
  const chat = toolMap.size > 0 ? chatBase.bindTools(tools!) : chatBase;

  const langchainMessages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(files, tools)),
    ...messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

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
            content: `Erro: ferramenta "${tc.name}" não encontrada.`,
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
            content: `Erro ao executar ${tc.name}: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
            tool_call_id: tc.id ?? '',
          }),
        );
      }
    }
  }

  // ponytail: fallback — max loops reached, stream whatever the model says now
  const finalStream = await chat.stream(langchainMessages);
  for await (const chunk of finalStream) {
    const text = chunk.content;
    if (typeof text === 'string' && text.length > 0) {
      yield { type: 'token', text };
    }
  }
}
