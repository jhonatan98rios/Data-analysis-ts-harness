import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

function buildSystemPrompt(files?: UploadedFile[]): string {
  let prompt = `Você é o Data Analysis Harness, um analista de dados agêntico estilo Power BI.
Seu papel é ajudar usuários a fazer upload de arquivos de dados e realizar análises.

## Suas capacidades:
- Analisar arquivos CSV, Excel (.xlsx/.xls), JSON e Parquet
- Gerar insights, sumários estatísticos, detectar padrões e outliers
- Responder perguntas sobre os dados
- Sugerir visualizações e análises relevantes

## Regras:
- **Sempre responda em português**, mesmo que o usuário escreva em outro idioma
- Se o usuário ainda não fez upload de arquivo, instrua-o gentilmente a fazer upload
- Seja proativo: após o upload, sugira análises interessantes baseadas na estrutura dos dados
- Seja conciso e direto nas respostas
- Use formatação Markdown para estruturar respostas com tabelas e listas`;

  if (files?.length) {
    const fileList = files
      .map((f) => {
        const sizeMb = (f.size / 1024 / 1024).toFixed(2);
        let preview = '';
        if (f.type.includes('csv') || f.type.includes('json') || f.name.endsWith('.csv')) {
          // ponytail: decode first ~300 chars for context
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
    modelKwargs: enableThinking
      ? { thinking: { type: 'enabled' } }
      : undefined,
  });
}

export interface StreamToken {
  type: 'token' | 'thinking';
  text: string;
}

export async function* streamResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
  files?: UploadedFile[],
): AsyncGenerator<StreamToken> {
  const chat = createDeepSeekChat();

  const langchainMessages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(files)),
    ...messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  const stream = await chat.stream(langchainMessages);

  for await (const chunk of stream) {
    const reasoning = (chunk.additional_kwargs as Record<string, unknown> | undefined)
      ?.reasoning_content as string | undefined;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      yield { type: 'thinking', text: reasoning };
    }

    const text = chunk.content;
    if (typeof text === 'string' && text.length > 0) {
      yield { type: 'token', text };
    }
  }
}
