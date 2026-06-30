import { onCall, HttpsError } from "firebase-functions/v2/https";
import { VisionAgent } from "./vision";
import { PromptContext } from "./promptBuilder";

// ─── Cloud Function: analyzeIssueMedia ─────────────────────────────────────
export const analyzeIssueMedia = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    const { mediaBase64, mimeType, userDescription, location } = request.data || {};

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required to analyze media.");
    }

    if (!mediaBase64 || !mimeType) {
      throw new HttpsError("invalid-argument", "Missing required fields: mediaBase64 and mimeType are required.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[analyzeIssueMedia] Gemini API key not configured");
      throw new HttpsError("failed-precondition", "Gemini API key is not configured on the server.");
    }

    try {
      console.log("[analyzeIssueMedia] Gemini request started");

      const visionAgent = new VisionAgent(apiKey);
      const context: PromptContext = {
        userDescription,
        location,
      };

      const result = await visionAgent.analyzeMedia(mediaBase64, mimeType, context);

      console.log("[analyzeIssueMedia] Gemini response received successfully");
      return result;
    } catch (err: any) {
      console.error("[analyzeIssueMedia] Gemini analysis failed:", err?.message || err, err?.stack);
      if (err instanceof HttpsError) {
        throw err;
      }
      throw new HttpsError("internal", err?.message || "AI analysis failed. Please retry.");
    }
  }
);
