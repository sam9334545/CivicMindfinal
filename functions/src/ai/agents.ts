import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_SYSTEM_PROMPTS } from "./prompts/prompts";
import { ResponseParser } from "./responseParser";

export interface AgentInputData {
  issueDetails: {
    category: string;
    subcategory: string;
    severityEstimate: string;
    userDescription: string;
    location: {
      lat: number;
      lng: number;
      address: string;
      ward: string;
    };
  };
  previousResults: Record<string, any>;
  caseMemory: any;
  nearbyIssues?: any[];
}

export class CouncilAgent {
  protected genAI: GoogleGenerativeAI;
  protected modelName = "gemini-1.5-flash"; // cost-effective & lightning-fast
  protected agentId: string;
  protected systemPrompt: string;

  constructor(apiKey: string, agentId: string, systemPrompt: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.agentId = agentId;
    this.systemPrompt = systemPrompt;
  }

  protected async executeWithRetry(userPrompt: string): Promise<any> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: this.systemPrompt,
    });

    let attempts = 0;
    let lastError: any = null;

    while (attempts < 2) {
      attempts++;
      try {
        const responseResult = await model.generateContent(userPrompt);
        const rawOutput = await responseResult.response.text();
        const parsed = ResponseParser.parseFlexibleJSON(rawOutput);
        return parsed;
      } catch (err: any) {
        lastError = err;
        console.warn(`[${this.agentId}] Attempt ${attempts} failed: ${err.message || err}`);
      }
    }
    throw new Error(`[${this.agentId}] Agent run failed after retries. Last error: ${lastError?.message || lastError}`);
  }
}

export class DuplicateAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "duplicate", AGENT_SYSTEM_PROMPTS.duplicate);
  }

  async run(input: AgentInputData): Promise<any> {
    const nearbySummary = (input.nearbyIssues || [])
      .map(
        (issue, idx) =>
          `Issue #${idx + 1}: ID: ${issue.id}, Category: ${issue.aiAnalysis?.category}, Subcategory: ${
            issue.aiAnalysis?.subcategory
          }, Description: "${issue.userDescription || issue.aiAnalysis?.aiDescription}", Location: "${
            issue.location?.address
          }", Status: "${issue.status}"`
      )
      .join("\n");

    const userPrompt = `Compare the new issue report against the nearby active issues.
NEW ISSUE REPORT:
- Category: ${input.issueDetails.category}
- Subcategory: ${input.issueDetails.subcategory}
- User Description: "${input.issueDetails.userDescription}"
- Location: "${input.issueDetails.location.address}"

NEARBY ISSUES LIST:
${nearbySummary || "No active issues in the same ward."}

Analyze duplicate probability. If the description is highly similar and location is within close distance, matches are duplicates.`;

    return this.executeWithRetry(userPrompt);
  }
}

export class SafetyAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "safety", AGENT_SYSTEM_PROMPTS.safety);
  }

  async run(input: AgentInputData): Promise<any> {
    const vision = input.previousResults.vision || {};
    
    const userPrompt = `Evaluate the safety implications of the following issue context.
ISSUE CATEGORY & DETAILS:
- Category: ${input.issueDetails.category}
- Subcategory: ${input.issueDetails.subcategory}
- User description: "${input.issueDetails.userDescription}"
- Location: "${input.issueDetails.location.address}"

VISION EVIDENCE:
- Detected objects: ${JSON.stringify(vision.objects || [])}
- Hazards flagged: ${JSON.stringify(vision.hazards || [])}

Calculate safety level risk and if emergency coordination is needed.`;

    return this.executeWithRetry(userPrompt);
  }
}

export class PriorityAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "priority", AGENT_SYSTEM_PROMPTS.priority);
  }

  async run(input: AgentInputData): Promise<any> {
    const vision = input.previousResults.vision || {};
    const duplicate = input.previousResults.duplicate || {};
    const safety = input.previousResults.safety || {};

    const userPrompt = `Synthesize priority for this issue. Resolve conflicts.
INITIAL ESTIMATE: ${input.issueDetails.severityEstimate}

VISION AGENT RECOMMENDATION:
- Severity: ${vision.severity || "medium"}
- Confidence: ${vision.confidence || 80}%

DUPLICATE AGENT STATUS:
- Duplicate Probability: ${duplicate.duplicateProbability || 0}%
- Reasoning: "${duplicate.findings || "No duplicate conflict"}"

SAFETY AGENT HAZARD ASSESSMENT:
- Safety Level: ${safety.safetyLevel || "medium"}
- Emergency Required: ${safety.emergencyRequired || false}

Synthesize comments. If there's duplicate probability >= 80%, we suggest reducing urgency. Overrule visual severity if Safety risk is high. Provide decision revision trace.`;

    return this.executeWithRetry(userPrompt);
  }
}

export class RoutingAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "routing", AGENT_SYSTEM_PROMPTS.routing);
  }

  async run(input: AgentInputData): Promise<any> {
    const priority = input.previousResults.priority || {};

    const userPrompt = `Determine department routing and response SLA deadline.
ISSUE DESCRIPTION:
- Category: ${input.issueDetails.category}
- Subcategory: ${input.issueDetails.subcategory}
- Location Ward: ${input.issueDetails.location.ward}

FINAL RESOLVED PRIORITY:
- Priority Level: ${priority.priority || "medium"}
- Rationale: "${priority.findings || "General priority guidelines"}"

Assign to a department (e.g. Roads & Infrastructure, Water Supply, Electricity Department) and specify recommended SLA hours.`;

    return this.executeWithRetry(userPrompt);
  }
}

export class ExecutiveAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "executive", AGENT_SYSTEM_PROMPTS.executive);
  }

  async run(input: AgentInputData): Promise<any> {
    const vision = input.previousResults.vision || {};
    const duplicate = input.previousResults.duplicate || {};
    const safety = input.previousResults.safety || {};
    const priority = input.previousResults.priority || {};
    const routing = input.previousResults.routing || {};

    const userPrompt = `Draft the executive report summaries and next actions checklist by reviewing council agent inputs.
COUNCIL FINDINGS MEMOS:
1. Vision: ${JSON.stringify(vision)}
2. Duplicate: ${JSON.stringify(duplicate)}
3. Safety: ${JSON.stringify(safety)}
4. Priority: ${JSON.stringify(priority)}
5. Routing: ${JSON.stringify(routing)}

Create:
- A technical technical summary for municipal officials.
- An empathetic, plain language summary for the citizen. Keep it simple and under 50 words.`;

    return this.executeWithRetry(userPrompt);
  }
}

export class ValidatorAgent extends CouncilAgent {
  constructor(apiKey: string) {
    super(apiKey, "validator", AGENT_SYSTEM_PROMPTS.validator);
  }

  async run(input: AgentInputData): Promise<any> {
    const executive = input.previousResults.executive || {};
    const routing = input.previousResults.routing || {};
    const priority = input.previousResults.priority || {};

    const userPrompt = `Validate logic consistency of final council determinations.
SUMMARY DETERMINED:
- Routing Department: ${routing.department}
- Priority: ${priority.priority}
- Executive Action checklist: ${JSON.stringify(executive.nextActions || [])}

Verify combinations. E.g., is a critical priority matched with no next actions? Are routing targets consistent with the category?`;

    return this.executeWithRetry(userPrompt);
  }
}
