"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisionAgent = void 0;
const generative_ai_1 = require("@google/generative-ai");
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/v2/https");
const promptBuilder_1 = require("./promptBuilder");
const responseParser_1 = require("./responseParser");
class VisionAgent {
    genAI;
    modelName = "gemini-1.5-flash"; // Can upgrade to gemini-2.0-flash if needed
    constructor(apiKey) {
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    async analyzeMedia(mediaBase64, mimeType, context) {
        const startTime = Date.now();
        let success = false;
        let attempts = 0;
        let result = null;
        let lastError = null;
        let rawOutput = "";
        const systemInstruction = promptBuilder_1.PromptBuilder.getVisionSystemPrompt();
        const userPrompt = promptBuilder_1.PromptBuilder.buildVisionPrompt(context);
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
                result = responseParser_1.ResponseParser.parseCleanJSON(rawOutput);
                success = true;
            }
            catch (err) {
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
        }
        catch (logErr) {
            console.error("AI Observability logging failed:", logErr);
        }
        if (success && result) {
            // Append runtime data
            result.processingTimeMs = duration;
            return result;
        }
        const message = `Vision Analysis failed after ${attempts} attempts.`;
        console.error(message, lastError);
        throw new https_1.HttpsError("unavailable", message, { attempts, lastError });
    }
}
exports.VisionAgent = VisionAgent;
//# sourceMappingURL=vision.js.map