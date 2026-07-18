import { describe, it, expect } from 'vitest';
import { AssessmentQuestionSchema } from '../src/schema';

// Helper that builds a valid question object. Individual tests override
// specific fields to exercise validation boundaries.
function makeValidQuestion(overrides: Record<string, unknown> = {}) {
  return {
    questionText: 'What does the useMemo hook do in React?',
    options: [
      { id: 'a', text: 'Caches a computed value', isCorrect: true },
      { id: 'b', text: 'Schedules a network call', isCorrect: false },
      { id: 'c', text: 'Mutates the DOM directly', isCorrect: false },
      { id: 'd', text: 'Replaces useState entirely', isCorrect: false },
    ],
    explanation: 'useMemo memoizes the result of a computation between renders.',
    difficulty: 'intermediate',
    language: 'en',
    ...overrides,
  };
}

describe('AssessmentQuestionSchema - valid input', () => {
  it('parses a fully valid question', () => {
    const result = AssessmentQuestionSchema.safeParse(makeValidQuestion());
    expect(result.success).toBe(true);
  });

  it('accepts each allowed difficulty enum value', () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      const result = AssessmentQuestionSchema.safeParse(
        makeValidQuestion({ difficulty })
      );
      expect(result.success).toBe(true);
    }
  });

  it('preserves the parsed data shape', () => {
    const input = makeValidQuestion();
    const result = AssessmentQuestionSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toHaveLength(4);
      expect(result.data.questionText).toBe(input.questionText);
      expect(result.data.difficulty).toBe('intermediate');
    }
  });
});

describe('AssessmentQuestionSchema - questionText constraints', () => {
  it('rejects questionText shorter than 10 characters', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ questionText: 'too short' })
    );
    expect(result.success).toBe(false);
  });

  it('accepts questionText at exactly 10 characters', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ questionText: '1234567890' })
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing questionText', () => {
    const q = makeValidQuestion();
    delete (q as Record<string, unknown>).questionText;
    const result = AssessmentQuestionSchema.safeParse(q);
    expect(result.success).toBe(false);
  });

  it('rejects a non-string questionText', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ questionText: 12345 })
    );
    expect(result.success).toBe(false);
  });
});

describe('AssessmentQuestionSchema - options constraints', () => {
  it('rejects fewer than 4 options', () => {
    const opts = makeValidQuestion().options.slice(0, 3);
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 options', () => {
    const base = makeValidQuestion().options;
    const opts = [...base, { id: 'e', text: 'Extra option', isCorrect: false }];
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects an empty options array', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: [] })
    );
    expect(result.success).toBe(false);
  });

  it('rejects an option missing the isCorrect flag', () => {
    const opts = makeValidQuestion().options.map((o) => ({ ...o }));
    delete (opts[0] as Record<string, unknown>).isCorrect;
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects an option where isCorrect is not a boolean', () => {
    const opts = makeValidQuestion().options.map((o) => ({ ...o }));
    (opts[0] as Record<string, unknown>).isCorrect = 'yes';
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects an option with a non-string id', () => {
    const opts = makeValidQuestion().options.map((o) => ({ ...o }));
    (opts[0] as Record<string, unknown>).id = 1;
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects options with no correct answer', () => {
    const opts = makeValidQuestion().options.map((o) => ({ ...o, isCorrect: false }));
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('rejects options with more than one correct answer', () => {
    const opts = makeValidQuestion().options.map((o) => ({ ...o }));
    (opts[1] as Record<string, unknown>).isCorrect = true; // now a and b both correct
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ options: opts })
    );
    expect(result.success).toBe(false);
  });

  it('accepts options with exactly one correct answer', () => {
    const result = AssessmentQuestionSchema.safeParse(makeValidQuestion());
    expect(result.success).toBe(true);
  });
});

describe('AssessmentQuestionSchema - difficulty enum', () => {
  it('rejects an unknown difficulty value', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ difficulty: 'expert' })
    );
    expect(result.success).toBe(false);
  });

  it('rejects a missing difficulty', () => {
    const q = makeValidQuestion();
    delete (q as Record<string, unknown>).difficulty;
    const result = AssessmentQuestionSchema.safeParse(q);
    expect(result.success).toBe(false);
  });

  it('treats the enum as case-sensitive', () => {
    const result = AssessmentQuestionSchema.safeParse(
      makeValidQuestion({ difficulty: 'Beginner' })
    );
    expect(result.success).toBe(false);
  });
});

describe('AssessmentQuestionSchema - other fields', () => {
  it('rejects a missing explanation', () => {
    const q = makeValidQuestion();
    delete (q as Record<string, unknown>).explanation;
    const result = AssessmentQuestionSchema.safeParse(q);
    expect(result.success).toBe(false);
  });

  it('rejects a missing language', () => {
    const q = makeValidQuestion();
    delete (q as Record<string, unknown>).language;
    const result = AssessmentQuestionSchema.safeParse(q);
    expect(result.success).toBe(false);
  });

  it('rejects a completely empty object', () => {
    const result = AssessmentQuestionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a null input', () => {
    const result = AssessmentQuestionSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
