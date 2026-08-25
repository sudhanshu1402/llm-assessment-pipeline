import { AssessmentQuestionSchema } from '../src/schema';

const question = {
  questionText: 'Which call is idempotent?',
  explanation: 'PUT replaces the resource, so repeating it changes nothing.',
  difficulty: 'intermediate',
  language: 'en'
};

const opt = (id: string, isCorrect: boolean) => ({ id, text: `choice ${id}`, isCorrect });

const cases: Array<[string, ReturnType<typeof opt>[]]> = [
  ['one correct option of 4', [opt('a', true), opt('b', false), opt('c', false), opt('d', false)]],
  ['two correct options of 4', [opt('a', true), opt('b', true), opt('c', false), opt('d', false)]]
];

for (const [label, options] of cases) {
  const result = AssessmentQuestionSchema.safeParse({ ...question, options });
  const verdict = result.success ? 'accepted' : `rejected: ${result.error.issues[0].message}`;
  console.log(`${label}: ${verdict}`);
}
