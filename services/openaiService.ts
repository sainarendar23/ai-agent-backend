import OpenAI from "openai";
import { storage } from "../storage";

class OpenAIService {
  private getClient(apiKey: string): OpenAI {
    return new OpenAI({ apiKey });
  }

  async testApiKey(apiKey: string): Promise<boolean> {
    try {
      const openai = this.getClient(apiKey);
      await openai.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  async analyzeEmail(userId: string, emailContent: string): Promise<{
    action: 'reply' | 'star' | 'ignore';
    confidence: number;
    reasoning: string;
  }> {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = this.getClient(credentials.openaiApiKey);

    const prompt = `
Analyze this email content and determine the appropriate action for a job seeker:

Email Content:
${emailContent}

Rules:
1. If the email asks for a resume/CV, respond with "reply"
2. If the email mentions being selected for next round, interview, or positive response, respond with "star"
3. Otherwise, respond with "ignore"

Respond with JSON in this format:
{
  "action": "reply|star|ignore",
  "confidence": number between 0-1,
  "reasoning": "brief explanation"
}
    `;

    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert email analyzer for job seekers. Analyze emails and determine the best action to take.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        action: result.action || 'ignore',
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        reasoning: result.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('Error analyzing email:', error);
      return {
        action: 'ignore',
        confidence: 0,
        reasoning: 'Error analyzing email',
      };
    }
  }

  async generateReply(userId: string, emailContent: string, fromEmail: string): Promise<string> {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = this.getClient(credentials.openaiApiKey);

    const personalDescription = credentials.personalDescription || 'a job seeker';
    const resumeLink = credentials.resumeLink || '';

    const prompt = `
Generate a professional email reply for a job seeker who received this email:

Original Email:
${emailContent}

Context:
- You are ${personalDescription}
- Resume link: ${resumeLink}
- This is a response to a job application

Generate a polite, professional reply that:
1. Thanks them for their interest
2. Provides the resume link if they asked for it
3. Expresses enthusiasm for the opportunity
4. Keeps it concise and professional

Do not include subject line or email headers, just the body text.
    `;

    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional email writer helping job seekers respond to employers.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      return response.choices[0].message.content || 'Thank you for your interest. Please find my resume attached.';
    } catch (error) {
      console.error('Error generating reply:', error);
      return 'Thank you for your interest. Please find my resume attached.';
    }
  }
}

export const openaiService = new OpenAIService();
