import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

// ponytail: single model instance per request, no factory needed
function createDeepSeekChat(): ChatOpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  return new ChatOpenAI({
    modelName: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    streaming: true,
    temperature: 0.7,
  });
}

export async function* streamResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
): AsyncGenerator<string> {
  const chat = createDeepSeekChat();

  const langchainMessages: BaseMessage[] = messages.map((m) =>
    m.role === 'user'
      ? new HumanMessage(m.content)
      : new AIMessage(m.content),
  );

  const stream = await chat.stream(langchainMessages);

  for await (const chunk of stream) {
    const text = chunk.content;
    if (typeof text === 'string' && text.length > 0) {
      yield text;
    }
  }
}
