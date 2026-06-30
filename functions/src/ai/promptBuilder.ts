import { VISION_SYSTEM_PROMPT, VISION_USER_PROMPT } from "./prompts/visionPrompt";

export interface PromptContext {
  userDescription?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

export class PromptBuilder {
  static buildVisionPrompt(context?: PromptContext): string {
    let prompt = VISION_USER_PROMPT;
    if (context?.userDescription) {
      prompt += `\nCitizen's added description context: "${context.userDescription}"`;
    }
    if (context?.location?.address) {
      prompt += `\nReported location address: "${context.location.address}"`;
    }
    return prompt;
  }

  static getVisionSystemPrompt(): string {
    return VISION_SYSTEM_PROMPT;
  }
}
