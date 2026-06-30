"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeIssueMedia = void 0;
const https_1 = require("firebase-functions/v2/https");
const vision_1 = require("./vision");
// ─── Cloud Function: analyzeIssueMedia ─────────────────────────────────────
exports.analyzeIssueMedia = (0, https_1.onCall)({
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
}, async (request) => {
    const { mediaBase64, mimeType, userDescription, location } = request.data || {};
    if (!request.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication is required to analyze media.");
    }
    if (!mediaBase64 || !mimeType) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: mediaBase64 and mimeType are required.");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("[analyzeIssueMedia] Gemini API key not configured");
        throw new https_1.HttpsError("failed-precondition", "Gemini API key is not configured on the server.");
    }
    try {
        console.log("[analyzeIssueMedia] Gemini request started");
        const visionAgent = new vision_1.VisionAgent(apiKey);
        const context = {
            userDescription,
            location,
        };
        const result = await visionAgent.analyzeMedia(mediaBase64, mimeType, context);
        console.log("[analyzeIssueMedia] Gemini response received successfully");
        return result;
    }
    catch (err) {
        console.error("[analyzeIssueMedia] Gemini analysis failed:", err?.message || err, err?.stack);
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        throw new https_1.HttpsError("internal", err?.message || "AI analysis failed. Please retry.");
    }
});
//# sourceMappingURL=gateway.js.map