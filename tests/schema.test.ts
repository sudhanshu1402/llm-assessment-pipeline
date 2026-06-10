import { describe, it, expect } from 'vitest';
import { AssessmentQuestionSchema } from '../src/schema';

const opt = (id: string, correct = false) => ({ id, text: `Option ${id}`, isCorrect: correct });
const valid = {
  questionText: 'What is the time complexity of binary search?',
  options: [opt('a', true), opt('b'), opt('c'), opt('d')],
  explanation: 'Binary search halves the search space each step, so O(log n).',
  difficulty: 'intermediate',
  language: 'en'
};

describe('AssessmentQuestionSchema', () => {
  it('accepts a well-formed question', () => {
    expect(AssessmentQuestionSchema.safeParse(valid).success).toBe(true);
  });

  it('requires exactly 4 options', () => {
    expect(AssessmentQuestionSchema.safeParse({ ...valid, options: valid.options.slice(0, 3) }).success).toBe(false);
    expect(AssessmentQuestionSchema.safeParse({ ...valid, options: [...valid.options, opt('e')] }).success).toBe(false);
  });

  it('rejects a questionText shorter than 10 chars', () => {
    expect(AssessmentQuestionSchema.safeParse({ ...valid, questionText: 'too short' }).success).toBe(false);
  });

  it('rejects an unknown difficulty', () => {
    expect(AssessmentQuestionSchema.safeParse({ ...valid, difficulty: 'wizard' }).success).toBe(false);
  });

  it('rejects an option missing isCorrect', () => {
    const bad = { ...valid, options: [{ id: 'a', text: 'A' }, opt('b'), opt('c'), opt('d')] };
    expect(AssessmentQuestionSchema.safeParse(bad).success).toBe(false);
  });
});
