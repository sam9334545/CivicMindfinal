"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIssueCreated = exports.analyzeIssueMedia = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const agentOrchestrator_1 = require("./ai/agentOrchestrator");
// Initialize Firebase Admin SDK
admin.initializeApp();
// Export Callable Cloud Functions
var gateway_1 = require("./ai/gateway");
Object.defineProperty(exports, "analyzeIssueMedia", { enumerable: true, get: function () { return gateway_1.analyzeIssueMedia; } });
// Export Firestore Document Trigger for AI City Council Pipeline
exports.onIssueCreated = (0, firestore_1.onDocumentCreated)({
    document: "issues/{issueId}",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["GEMINI_API_KEY"],
}, async (event) => {
    const issueId = event.params.issueId;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Gemini API key is not configured in environment variables. Pipeline aborted.");
        return;
    }
    try {
        const orchestrator = new agentOrchestrator_1.AgentOrchestrator(issueId, apiKey);
        await orchestrator.executePipeline();
    }
    catch (err) {
        console.error("Orchestrator Pipeline failed to execute:", err);
    }
});
//# sourceMappingURL=index.js.map