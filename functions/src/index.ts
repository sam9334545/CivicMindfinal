import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { AgentOrchestrator } from "./ai/agentOrchestrator";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export Callable Cloud Functions
export { analyzeIssueMedia } from "./ai/gateway";

// Export Firestore Document Trigger for AI City Council Pipeline
export const onIssueCreated = onDocumentCreated(
  {
    document: "issues/{issueId}",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["GEMINI_API_KEY"],
  },
  async (event) => {
    const issueId = event.params.issueId;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Gemini API key is not configured in environment variables. Pipeline aborted.");
      return;
    }

    try {
      const orchestrator = new AgentOrchestrator(issueId, apiKey);
      await orchestrator.executePipeline();
    } catch (err) {
      console.error("Orchestrator Pipeline failed to execute:", err);
    }
  }
);
