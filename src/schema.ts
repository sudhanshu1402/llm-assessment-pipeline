import { z } from 'zod';

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const AssessmentQuestionSchema = z.object({
  questionText: z.string().min(10).describe('The main text of the question'),
  options: z
    .array(
      z.object({
        id: z.string().describe('Unique identifier for the option (a, b, c, d)'),
        text: z.string().describe('The choice text'),
        isCorrect: z.boolean().describe('Whether this is the correct answer')
      })
    )
    .length(4)
    .describe('Exactly 4 multiple choice options')
    // A single-answer MCQ is only well-formed with exactly one correct option.
    // The LLM can emit zero or several; reject those before they reach storage.
    .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
      message: 'exactly one option must be marked isCorrect'
    }),
  explanation: z.string().describe('Explanation of why the correct answer is correct'),
  difficulty: z.enum(DIFFICULTIES),
  language: z.string().describe('The locale language code (e.g. en, fr, es)')
});

export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;
