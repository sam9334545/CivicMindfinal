"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptBuilder = void 0;
const visionPrompt_1 = require("./prompts/visionPrompt");
class PromptBuilder {
    static buildVisionPrompt(context) {
        let prompt = visionPrompt_1.VISION_USER_PROMPT;
        if (context?.userDescription) {
            prompt += `\nCitizen's added description context: "${context.userDescription}"`;
        }
        if (context?.location?.address) {
            prompt += `\nReported location address: "${context.location.address}"`;
        }
        return prompt;
    }
    static getVisionSystemPrompt() {
        return visionPrompt_1.VISION_SYSTEM_PROMPT;
    }
}
exports.PromptBuilder = PromptBuilder;
//# sourceMappingURL=promptBuilder.js.map