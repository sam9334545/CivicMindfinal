"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseParser = void 0;
const validators_1 = require("./validators");
class ResponseParser {
    static parseFlexibleJSON(rawText) {
        let cleaned = rawText.trim();
        // Try parsing the raw text directly first.
        try {
            return JSON.parse(cleaned);
        }
        catch {
            // Extract the first JSON object if the model adds extra text or markdown.
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
            }
        }
        try {
            return JSON.parse(cleaned);
        }
        catch (e) {
            console.error("Failed to parse Gemini output:", rawText);
            throw new Error(`Invalid JSON format: ${e.message}`);
        }
    }
    static parseCleanJSON(rawText) {
        const parsed = this.parseFlexibleJSON(rawText);
        if ((0, validators_1.validateAIAnalysisResult)(parsed)) {
            return parsed;
        }
        throw new Error("Parsed JSON fails schema validation criteria.");
    }
}
exports.ResponseParser = ResponseParser;
//# sourceMappingURL=responseParser.js.map