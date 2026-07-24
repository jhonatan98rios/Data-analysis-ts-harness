import { streamResponse, type StreamToken } from '@/lib/chat/stream';

export const runtime = 'edge';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      files?: UploadedFile[];
    };

    if (!body.messages?.length) {
      return new Response('messages required', { status: 400 });
    }

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const st of streamResponse(body.messages, body.files)) {
            enqueue(st.type === 'thinking' ? { thinking: st.text } : { token: st.text });
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'stream error';
          enqueue({ error: msg });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
