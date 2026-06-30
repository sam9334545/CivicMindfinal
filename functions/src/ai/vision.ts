import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { PromptBuilder, PromptContext } from "./promptBuilder";
import { ResponseParser } from "./responseParser";
import { AIAnalysisResult } from "./validators";

export class VisionAgent {
  private genAI: GoogleGenerativeAI;
  private modelName = "gemini-1.5-flash"; // Can upgrade to gemini-2.0-flash if needed

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async analyzeMedia(
    mediaBase64: string,
    mimeType: string,
    context?: PromptContext
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    let success = false;
    let attempts = 0;
    let result: AIAnalysisResult | null = null;
    let lastError: string | null = null;
    let rawOutput = "";

    const systemInstruction = PromptBuilder.getVisionSystemPrompt();
    const userPrompt = PromptBuilder.buildVisionPrompt(context);

    // Initializing Gemini Model with System Instructions
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction,
    });

    const mediaPart = {
      inlineData: {
        data: mediaBase64,
        mimeType,
      },
    };

    while (attempts < 2 && !success) {
      attempts++;
      try {
        const responseResult = await model.generateContent([mediaPart, userPrompt]);
        rawOutput = await responseResult.response.text();
        result = ResponseParser.parseCleanJSON(rawOutput);
        success = true;
      } catch (err: any) {
        lastError = err.message || "Unknown error";
        console.warn(`Vision Analysis attempt ${attempts} failed: ${lastError}`);
      }
    }

    const duration = Date.now() - startTime;

    // Log the AI execution in Firestore (AI Observability)
    try {
      const db = admin.firestore();
      await db.collection("ai_logs").add({
        model: this.modelName,
        agentId: "vision",
        success,
        attempts,
        processingTimeMs: duration,
        confidence: result?.confidence || 0,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        promptVersion: "1.0.0",
        error: lastError,
        rawOutput: success ? rawOutput : undefined,
      });
    } catch (logErr) {
      console.error("AI Observability logging failed:", logErr);
    }

    if (success && result) {
      // Append runtime data
      result.processingTimeMs = duration;
      return result;
    }

    const message = `Vision Analysis failed after ${attempts} attempts.`;
    console.error(message, lastError);
    throw new HttpsError("unavailable", message, { attempts, lastError });
  }
}
