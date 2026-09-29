import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { buildTraceDoc, toTraceMessages } from '@/lib/trace';

describe('trace serialization', () => {
  it('converts an agentic trajectory to OpenAI chat format with reasoning', () => {
    const { messages, truncated } = toTraceMessages([
      new SystemMessage('system prompt'),
      new HumanMessage('qual o total?'),
      new AIMessage({
        content: '',
        reasoning_content: undefined,
        additional_kwargs: { reasoning_content: 'preciso somar a coluna' },
        tool_calls: [{ name: 'aggregate', args: { column: 'Vl_Total', operation: 'sum' }, id: 'call_1', type: 'function' }],
      } as never),
      new ToolMessage({ content: '{"value":4200}', tool_call_id: 'call_1', name: 'aggregate' }),
      new AIMessage({ content: 'O total é R$ 4.200.', additional_kwargs: { reasoning_content: 'pronto' } }),
    ]);

    assert.equal(truncated, 0);
    assert.equal(messages.length, 5);
    assert.deepEqual(
      messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'assistant'],
    );

    const toolTurn = messages[2];
    assert.equal(toolTurn.content, '');
    assert.equal(toolTurn.reasoning_content, 'preciso somar a coluna');
    assert.deepEqual(toolTurn.tool_calls, [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'aggregate', arguments: '{"column":"Vl_Total","operation":"sum"}' },
      },
    ]);

    assert.equal(messages[3].tool_call_id, 'call_1');
    assert.equal(messages[3].name, 'aggregate');
    assert.equal(messages[4].content, 'O total é R$ 4.200.');
    assert.equal(messages[4].reasoning_content, 'pronto');
  });

  it('drops injected retry nudges and truncates huge tool results', () => {
    const big = 'x'.repeat(9000);
    const { messages, truncated } = toTraceMessages([
      new HumanMessage('oi'),
      new AIMessage('oi!'),
      new HumanMessage('Continue.'),
      new ToolMessage({ content: big, tool_call_id: 'c1' }),
    ]);

    assert.ok(!messages.some((m) => m.content === 'Continue.'));
    assert.equal(truncated, 1);
    const toolMsg = messages.find((m) => m.role === 'tool')!;
    assert.ok(toolMsg.content.startsWith('x'.repeat(8000)));
    assert.ok(toolMsg.content.includes('[truncado: 9000 chars]'));
  });

  it('builds a fine-tuning doc with tool metadata', () => {
    const doc = buildTraceDoc({
      trace: {
        messages: [
          new AIMessage({
            content: 'oi',
            tool_calls: [{ name: 'plot', args: {}, id: 'c9', type: 'function' }],
          } as never),
        ],
      },
      sessionId: 'sess-1',
      tenantId: 'default',
      model: 'deepseek-v4-flash',
      tools: [],
      latencyMs: 1234,
      temperature: 0.7,
      thinking: true,
      error: null,
      now: new Date('2026-01-01T00:00:00Z'),
    });

    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.sessionId, 'sess-1');
    assert.deepEqual(doc.toolsUsed, ['plot']);
    assert.equal(doc.meta.status, 'ok');
    assert.equal(doc.meta.toolCalls, 1);
    assert.equal(doc.meta.rounds, 1);
    assert.equal(doc.meta.error, undefined);

    const failed = buildTraceDoc({
      trace: { messages: [] },
      sessionId: 'sess-2',
      tenantId: 'default',
      model: 'deepseek-v4-flash',
      tools: [],
      latencyMs: 10,
      temperature: 0.7,
      thinking: false,
      error: 'stream error',
    });
    assert.equal(failed.meta.status, 'error');
    assert.equal(failed.meta.error, 'stream error');
  });
});
