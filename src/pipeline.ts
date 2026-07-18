import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { AssessmentQuestionSchema, AssessmentQuestion, Difficulty } from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

// 1. Define Models
// Primary Model: High reasoning capability for generating complex domains
const primaryLlm = new ChatOpenAI({
  modelName: 'gpt-4o-mini', 
  temperature: 0.2,
  maxRetries: 2,
});

// Fallback / Validation Model: Fast generation, cheaper cross-checking
const validationLlm = new ChatGoogleGenerativeAI({
  model: 'gemini-1.5-flash',
  temperature: 0.1,
  maxRetries: 2,
});

// 2. Define Output Parser mapping to Zod Schema
const parser = StructuredOutputParser.fromZodSchema(AssessmentQuestionSchema);

// 3. Define the Prompt
const generationPrompt = PromptTemplate.fromTemplate(`
You are an expert technical assessor creating questions for a high-stakes developer screening platform.
Create one multiple-choice question assessing the following topic: {topic}.
The target difficulty is: {difficulty}.
The target language is: {language}.
Provide exactly 4 options, and mark exactly one of them as correct (isCorrect: true).

{format_instructions}
`);

export class AssessmentOrchestrator {
  private primaryChain: RunnableSequence;
  
  constructor() {
    this.primaryChain = RunnableSequence.from([
      generationPrompt,
      primaryLlm,
      parser,
    ]);
  }

  /**
   * Generates content using OpenAI, and if the primary chain fails outright
   * (e.g. rate limit, timeout, or output that fails Zod validation), the whole
   * chain re-runs against Gemini. This is sequential failover, not parallel
   * consensus — only one model's output is ever returned.
   */
  async generateQuestion(topic: string, difficulty: Difficulty, language: string): Promise<AssessmentQuestion> {
    console.log(`[Pipeline] Orchestrating generation for: ${topic} (${difficulty}, ${language})`);
    
    try {
      // Execute the primary generating sequence
      const result = await this.primaryChain.invoke({
        topic,
        difficulty,
        language,
        format_instructions: parser.getFormatInstructions(),
      });
      
      console.log(`[Pipeline] Successfully generated via GPT-4`);
      return result;
      
    } catch (primaryError) {
      console.warn(`[Pipeline] Primary generation failed. Routing to Gemini fallback...`, primaryError);
      
      // Fallback Routing Sequence
      const fallbackChain = RunnableSequence.from([
        generationPrompt,
        validationLlm,
        parser,
      ]);
      
      const result = await fallbackChain.invoke({
        topic,
        difficulty,
        language,
        format_instructions: parser.getFormatInstructions(),
      });
      
      console.log(`[Pipeline] Successfully recovered via Gemini`);
      return result;
    }
  }
}
