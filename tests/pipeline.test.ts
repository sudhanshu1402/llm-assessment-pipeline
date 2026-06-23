import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pipeline module instantiates the LLM clients at import time and builds
// LangChain runnable sequences. We mock every external LangChain dependency so
// that NO real OpenAI or Gemini network call happens and NO API key is needed.
//
// Strategy: RunnableSequence.from(...) is the single seam through which the
// orchestrator builds both the primary (OpenAI) chain and the fallback (Gemini)
// chain. We replace it with a factory that hands back stub chains whose .invoke
// behavior each test controls. The constructor builds the primary chain (first
// from() call); the catch block builds the fallback chain (a later from() call).

// invoke implementations are pushed in the order chains are constructed.
const invokeQueue: Array<(...args: unknown[]) => unknown> = [];
// Records every invoke call so tests can assert how many chains actually ran.
const invokeCalls: Array<{ chainIndex: number; input: unknown }> = [];

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(function ChatOpenAI() {
    return { _kind: 'openai' };
  }),
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn(function ChatGoogleGenerativeAI() {
    return { _kind: 'gemini' };
  }),
}));

vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn(() => ({ _kind: 'prompt' })),
  },
}));

vi.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: vi.fn(() => ({
      getFormatInstructions: vi.fn(() => 'FORMAT_INSTRUCTIONS'),
    })),
  },
}));

vi.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    // Each call to from() mints a new stub chain bound to the next queued
    // invoke implementation. The chain index is captured at construction time.
    from: vi.fn(() => {
      const chainIndex = invokeQueue.length === 0 ? 0 : invokeCalls.length;
      const impl = invokeQueue.shift();
      return {
        invoke: vi.fn(async (input: unknown) => {
          const idx = invokeCalls.length;
          invokeCalls.push({ chainIndex: idx, input });
          if (!impl) {
            throw new Error('No invoke implementation queued for this chain');
          }
          return impl(input);
        }),
      };
    }),
  },
}));

// Import AFTER the mocks are registered so the module picks up the stubs.
import { AssessmentOrchestrator } from '../src/pipeline';

function validQuestion() {
  return {
    questionText: 'What is the output of a Python generator function call?',
    options: [
      { id: 'a', text: 'A generator object', isCorrect: true },
      { id: 'b', text: 'A list', isCorrect: false },
      { id: 'c', text: 'None', isCorrect: false },
      { id: 'd', text: 'A tuple', isCorrect: false },
    ],
    explanation: 'Calling a generator function returns a generator object.',
    difficulty: 'intermediate',
    language: 'en',
  };
}

describe('AssessmentOrchestrator.generateQuestion', () => {
  beforeEach(() => {
    invokeQueue.length = 0;
    invokeCalls.length = 0;
    vi.clearAllMocks();
    // Silence the pipeline's console noise during assertions.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('returns the primary chain result when the primary model succeeds', async () => {
    const expected = validQuestion();
    // Primary chain (built in constructor) succeeds.
    invokeQueue.push(async () => expected);

    const orchestrator = new AssessmentOrchestrator();
    const result = await orchestrator.generateQuestion('Python', 'intermediate', 'en');

    expect(result).toEqual(expected);
    // Only the primary chain should have been invoked. No fallback.
    expect(invokeCalls).toHaveLength(1);
  });

  it('passes the prompt inputs through to the primary chain invoke', async () => {
    invokeQueue.push(async () => validQuestion());

    const orchestrator = new AssessmentOrchestrator();
    await orchestrator.generateQuestion('Closures', 'advanced', 'fr');

    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0].input).toMatchObject({
      topic: 'Closures',
      difficulty: 'advanced',
      language: 'fr',
      format_instructions: 'FORMAT_INSTRUCTIONS',
    });
  });

  it('falls back to the secondary chain when the primary throws', async () => {
    const recovered = validQuestion();
    // Primary chain throws (e.g. rate limit), fallback chain succeeds.
    invokeQueue.push(async () => {
      throw new Error('OpenAI rate limit exceeded');
    });
    invokeQueue.push(async () => recovered);

    const orchestrator = new AssessmentOrchestrator();
    const result = await orchestrator.generateQuestion('SQL joins', 'beginner', 'es');

    expect(result).toEqual(recovered);
    // Primary failed then fallback ran: two invocations total.
    expect(invokeCalls).toHaveLength(2);
  });

  it('forwards the same inputs to the fallback chain after a primary failure', async () => {
    invokeQueue.push(async () => {
      throw new Error('primary down');
    });
    invokeQueue.push(async () => validQuestion());

    const orchestrator = new AssessmentOrchestrator();
    await orchestrator.generateQuestion('Recursion', 'advanced', 'de');

    expect(invokeCalls).toHaveLength(2);
    // Fallback (second invoke) gets the identical prompt inputs.
    expect(invokeCalls[1].input).toMatchObject({
      topic: 'Recursion',
      difficulty: 'advanced',
      language: 'de',
      format_instructions: 'FORMAT_INSTRUCTIONS',
    });
  });

  it('propagates the error (DLQ path) when both primary and fallback throw', async () => {
    invokeQueue.push(async () => {
      throw new Error('OpenAI failure');
    });
    invokeQueue.push(async () => {
      throw new Error('Gemini failure');
    });

    const orchestrator = new AssessmentOrchestrator();

    await expect(
      orchestrator.generateQuestion('Pointers', 'advanced', 'en')
    ).rejects.toThrow('Gemini failure');

    // Both chains were attempted before the failure propagated.
    expect(invokeCalls).toHaveLength(2);
  });

  it('logs a warning when routing to the fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    invokeQueue.push(async () => {
      throw new Error('primary boom');
    });
    invokeQueue.push(async () => validQuestion());

    const orchestrator = new AssessmentOrchestrator();
    await orchestrator.generateQuestion('Hash maps', 'intermediate', 'en');

    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not invoke the fallback chain when the primary succeeds', async () => {
    invokeQueue.push(async () => validQuestion());
    // A second implementation is queued but should never be consumed.
    invokeQueue.push(async () => {
      throw new Error('fallback should not run');
    });

    const orchestrator = new AssessmentOrchestrator();
    await orchestrator.generateQuestion('Arrays', 'beginner', 'en');

    expect(invokeCalls).toHaveLength(1);
  });
});
