export interface AIAnalysisResult {
  category: string;
  subcategory: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
  detectedObjects: string[];
  possibleHazards: string[];
  departmentSuggestion: string;
  contextFactors: string[];
  urgencyReason: string;
  processingTimeMs?: number;
}

export const VALID_CATEGORIES = [
  "road_damage",
  "water_issue",
  "electricity",
  "waste_management",
  "public_safety",
  "green_spaces",
  "drainage",
  "public_property",
  "noise_pollution",
  "air_quality",
  "animal_control",
  "other"
];

export const VALID_SEVERITIES = ["critical", "high", "medium", "low"];

export function validateAIAnalysisResult(obj: any): obj is AIAnalysisResult {
  if (!obj || typeof obj !== "object") return false;

  // Type checks
  if (typeof obj.category !== "string" || !VALID_CATEGORIES.includes(obj.category)) {
    // If category is slightly off, we can normalize it to "other" instead of crashing
    obj.category = "other";
  }

  if (typeof obj.subcategory !== "string") return false;

  if (typeof obj.severity !== "string" || !VALID_SEVERITIES.includes(obj.severity)) {
    obj.severity = "medium"; // Default fallback
  }

  if (typeof obj.confidence !== "number" || isNaN(obj.confidence)) return false;
  if (typeof obj.title !== "string" || obj.title.trim() === "") return false;
  if (typeof obj.description !== "string" || obj.description.trim() === "") return false;

  if (!Array.isArray(obj.detectedObjects)) obj.detectedObjects = [];
  if (!Array.isArray(obj.possibleHazards)) obj.possibleHazards = [];
  if (!Array.isArray(obj.contextFactors)) obj.contextFactors = [];

  if (typeof obj.departmentSuggestion !== "string") obj.departmentSuggestion = "Other Services";
  if (typeof obj.urgencyReason !== "string") obj.urgencyReason = "General Assessment";

  return true;
}
