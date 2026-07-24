import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';

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
      : 'input';
    return [
      `### ${t.name}`,
      `**O que faz:** ${t.description}`,
      `**Quando usar:** sempre que o usuário pedir para calcular, somar, totalizar, agregar, ou obter o valor total de uma coluna nos dados.`,
      `**Parâmetros:** \`${params}\``,
      `**Exemplo:** se o usuário perguntar "qual o total de vendas?", chame \`${t.name}\` com a coluna que contém os valores de venda.`,
    ].join('\n');
  });

  return `\n\n## 🛠 Manual de Ferramentas\n\nAs ferramentas abaixo estão disponíveis. Use-as obrigatoriamente quando o usuário fizer perguntas numéricas sobre os dados — NUNCA tente calcular ou estimar valores de cabeça.\n\n${entries.join('\n\n')}\n\n**Regra de ouro:** se a pergunta envolve números, valores, totais, somas, médias, contagens, ou qualquer operação matemática sobre os dados → chame a ferramenta correspondente. Nunca responda com números inventados ou estimados.`;
}

function buildSystemPrompt(
  files?: UploadedFile[],
  tools?: StructuredToolInterface[],
): string {
  let prompt = `Você é o Data Analysis Harness, um analista de dados agêntico estilo Power BI.
Seu papel é ajudar usuários a fazer upload de arquivos de dados e realizar análises.

## Suas capacidades:
- Analisar arquivos CSV, Excel (.xlsx/.xls), JSON e Parquet
- Gerar insights, sumários estatísticos, detectar padrões e outliers
- Responder perguntas sobre os dados
- Sugerir visualizações e análises relevantes
- Usar ferramentas disponíveis para consultar e agregar dados

## Regras:
- **Sempre responda em português**, mesmo que o usuário escreva em outro idioma
- Se o usuário ainda não fez upload de arquivo, instrua-o gentilmente a fazer upload
- Seja proativo: após o upload, sugira análises interessantes baseadas na estrutura dos dados
- Seja conciso e direto nas respostas
- Use formatação Markdown para estruturar respostas com tabelas e listas
- Use as ferramentas disponíveis quando precisar consultar dados numéricos`;

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
  type: 'token' | 'thinking';
  text: string;
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
      // Final answer — yield from invoke response (ponytail: no extra stream call)
      const reasoning = (
        response.additional_kwargs as Record<string, unknown> | undefined
      )?.reasoning_content as string | undefined;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        yield { type: 'thinking', text: reasoning };
      }
      const text = typeof response.content === 'string' ? response.content : '';
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
        const result = await tool.invoke(tc.args);
        langchainMessages.push(
          new ToolMessage({
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: tc.id ?? '',
            name: tc.name,
          }),
        );
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
