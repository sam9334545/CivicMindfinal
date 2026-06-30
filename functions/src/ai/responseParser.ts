import { validateAIAnalysisResult, AIAnalysisResult } from "./validators";

export class ResponseParser {
  static parseFlexibleJSON(rawText: string): any {
    let cleaned = rawText.trim();

    // Try parsing the raw text directly first.
    try {
      return JSON.parse(cleaned);
    } catch {
      // Extract the first JSON object if the model adds extra text or markdown.
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    try {
      return JSON.parse(cleaned);
    } catch (e: any) {
      console.error("Failed to parse Gemini output:", rawText);
      throw new Error(`Invalid JSON format: ${e.message}`);
    }
  }

  static parseCleanJSON(rawText: string): AIAnalysisResult {
    const parsed = this.parseFlexibleJSON(rawText);
    if (validateAIAnalysisResult(parsed)) {
      return parsed;
    }
    throw new Error("Parsed JSON fails schema validation criteria.");
  }
}
