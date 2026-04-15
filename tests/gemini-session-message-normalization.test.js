const assert = require('assert');
const {
  normalizeGeminiMessageContent,
  extractTextParts,
  formatGeminiToolCalls,
  __resetUnknownShapeCounterForTest
} = require('../src/server/services/gemini-message-normalizer');

function runTests() {
  __resetUnknownShapeCounterForTest();

  // string content
  {
    const result = normalizeGeminiMessageContent({
      type: 'user',
      content: 'hello'
    });
    assert.strictEqual(result.normalizedText, 'hello');
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // array content
  {
    const result = normalizeGeminiMessageContent({
      type: 'user',
      content: [{ text: 'line-1' }, { content: 'line-2' }]
    });
    assert.strictEqual(result.normalizedText, 'line-1\nline-2');
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // object content with parts
  {
    const result = normalizeGeminiMessageContent({
      type: 'assistant',
      content: {
        parts: [{ text: 'part-A' }, { text: 'part-B' }]
      }
    });
    assert.strictEqual(result.normalizedText, 'part-A\npart-B');
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // message.parts fallback
  {
    const result = normalizeGeminiMessageContent({
      type: 'assistant',
      parts: [{ text: 'from-message-parts' }]
    });
    assert.strictEqual(result.normalizedText, 'from-message-parts');
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // unknown object structure
  {
    const result = normalizeGeminiMessageContent({
      type: 'assistant',
      content: { foo: 'bar' }
    });
    assert.strictEqual(result.isUnknownStructure, true);
    assert.strictEqual(result.unknownReason, 'content_object_unrecognized');
    assert.ok(result.normalizedText.includes('"foo"'));
  }

  // empty content fallback
  {
    const result = normalizeGeminiMessageContent({
      type: 'assistant',
      content: null
    });
    assert.strictEqual(result.normalizedText, '[空消息]');
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // toolCalls-only message should not become [空消息]
  {
    const result = normalizeGeminiMessageContent({
      type: 'gemini',
      content: '',
      toolCalls: [
        {
          name: 'run_shell_command',
          args: { command: 'echo hello' },
          result: [
            {
              functionResponse: {
                response: {
                  output: 'Output: hello'
                }
              }
            }
          ]
        }
      ]
    });
    assert.notStrictEqual(result.normalizedText, '[空消息]');
    assert.ok(result.normalizedText.includes('**[调用工具: run_shell_command]**'));
    assert.ok(result.normalizedText.includes('**[工具结果]**'));
    assert.strictEqual(result.isUnknownStructure, false);
  }

  // formatGeminiToolCalls should prefer resultDisplay when available
  {
    const text = formatGeminiToolCalls([
      {
        name: 'grep',
        args: { pattern: 'foo' },
        resultDisplay: 'found foo'
      }
    ]);
    assert.ok(text.includes('found foo'));
    assert.ok(text.includes('调用工具: grep'));
  }

  // extractTextParts should mark unknown when nested segment cannot be decoded
  {
    const extracted = extractTextParts([{ text: 'a' }, { unknown: true }]);
    assert.strictEqual(extracted.text.includes('a'), true);
    assert.strictEqual(extracted.unknown, true);
  }

  console.log('✓ gemini-session-message-normalization tests passed');
}

runTests();
