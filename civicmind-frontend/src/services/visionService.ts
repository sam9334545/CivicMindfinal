
import { AIAnalysisResult } from "../ai/models/types";
import { analyzeIssueMedia } from "../ai/utils/aiClient";

// ─── Timeout duration (ms) ───────────────────────────────────────────────────────
const AI_TIMEOUT_MS = 15_000;

// ─── Client-side fallback result ────────────────────────────────────────────────────
export function generateClientFallback(file: File): AIAnalysisResult {
  console.log("[VisionService] Fallback triggered — generating mock AI result");
  const name = file.name.toLowerCase();
  let category: AIAnalysisResult["category"] = "road_damage";
  let subcategory = "Infrastructure Issue";
  let department = "Roads & Infrastructure Department";

  if (name.includes("water") || name.includes("flood") || name.includes("pipe")) {
    category = "water_issue";
    subcategory = "Water Supply / Drainage Issue";
    department = "Pune Municipal Water Supply";
  } else if (name.includes("trash") || name.includes("garbage") || name.includes("waste")) {
    category = "waste_management";
    subcategory = "Solid Waste Accumulation";
    department = "PCMC Solid Waste Management";
  } else if (name.includes("light") || name.includes("electric") || name.includes("power")) {
    category = "electricity";
    subcategory = "Streetlight / Power Outage";
    department = "MSEDCL — Maharashtra Electricity";
  } else if (name.includes("tree") || name.includes("park") || name.includes("garden")) {
    category = "green_spaces";
    subcategory = "Green Space / Tree Issue";
    department = "Pune Garden Department";
  }

  return {
    category,
    subcategory,
    severity: "medium",
    confidence: 75,
    title: "Community Infrastructure Issue",
    description:
      "An infrastructure concern has been recorded and submitted. The AI Vision service is currently unavailable — this report will be reviewed manually by the assigned department.",
    detectedObjects: ["infrastructure", "public area"],
    possibleHazards: ["Public safety risk", "Community impact"],
    departmentSuggestion: department,
    contextFactors: ["Urban environment", "Requires department inspection"],
    urgencyReason: "AI service is temporarily unavailable. Report queued for manual review.",
    processingTimeMs: 0,
  };
}

// ─── Promise-based timeout wrapper ───────────────────────────────────────
// ─── Main VisionService ───────────────────────────────────────────────────
export class VisionService {
  /**
   * Converts a File to a base64 string (data portion only, no prefix).
   */
  private static fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * Runs Gemini Vision Analysis directly from the browser via the official Gemini SDK.
   * Falls back gracefully if the AI service is unavailable or times out.
   */
  static async analyzeMedia(
    file: File,
    userDescription?: string,
    location?: { lat: number; lng: number; address?: string }
  ): Promise<AIAnalysisResult> {
    console.log("[VisionService] Starting Gemini Vision analysis from browser");

    // 1. Convert file to base64
    const mediaBase64 = await this.fileToBase64(file);
    const mimeType = file.type || "image/jpeg";

    // 2. Call Gemini REST endpoint with timeout guard
    console.log("[VisionService] Gemini request started — timeout:", AI_TIMEOUT_MS, "ms");

    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error("AI Vision request timed out. Please try again."));
      }, AI_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        analyzeIssueMedia(mediaBase64, mimeType, userDescription, location),
        timeoutPromise,
      ]);

      console.log("[VisionService] Gemini response received — analysis complete");
      return sanitizeResult(response);
    } catch (error: any) {
      console.error("[VisionService] AI Gateway invocation failed:", error?.code, error?.details || error?.message || error);
      // Detect network/CORS/internal failures and provide actionable guidance
      const rawMsg = error?.details || error?.message;
      const isNetworkOrCORS =
        !error?.details &&
        (rawMsg?.includes("Failed to fetch") || rawMsg?.includes("net::ERR_FAILED") || rawMsg?.includes("CORS") || (error?.code && error.code.includes("internal")));

      const message = isNetworkOrCORS
        ? "AI service unreachable. Verify VITE_GEMINI_API_KEY, CORS, and network connectivity."
        : rawMsg || "AI Vision invocation failed.";
      const errOut = new Error(message) as any;
      errOut.code = error?.code;
      errOut.details = error?.details;
      throw errOut;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }
}

// ─── Result sanitizer ────────────────────────────────────────────────────
function sanitizeResult(raw: any): AIAnalysisResult {
  return {
    category: raw?.category || "road_damage",
    subcategory: raw?.subcategory || "General Infrastructure Issue",
    severity: (["critical", "high", "medium", "low"].includes(raw?.severity)
      ? raw.severity
      : "medium") as AIAnalysisResult["severity"],
    confidence: typeof raw?.confidence === "number" ? raw.confidence : 75,
    title: raw?.title || "Community Issue Report",
    description: raw?.description || "Issue submitted for municipal review.",
    detectedObjects: Array.isArray(raw?.detectedObjects) ? raw.detectedObjects : [],
    possibleHazards: Array.isArray(raw?.possibleHazards) ? raw.possibleHazards : [],
    departmentSuggestion: raw?.departmentSuggestion || "General Services",
    contextFactors: Array.isArray(raw?.contextFactors) ? raw.contextFactors : [],
    urgencyReason: raw?.urgencyReason || "Requires department review",
    processingTimeMs: raw?.processingTimeMs || 0,
  };
}
