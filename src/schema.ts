import { z } from 'zod';

export const AssessmentQuestionSchema = z.object({
  questionText: z.string().min(10).describe('The main text of the question'),
  options: z.array(
    z.object({
      id: z.string().describe('Unique identifier for the option (a, b, c, d)'),
      text: z.string().describe('The choice text'),
      isCorrect: z.boolean().describe('Whether this is the correct answer')
    })
  ).length(4).describe('Exactly 4 multiple choice options'),
  explanation: z.string().describe('Explanation of why the correct answer is correct'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  language: z.string().describe('The locale language code (e.g. en, fr, es)')
});

export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;
