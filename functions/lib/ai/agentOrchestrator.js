"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const admin = require("firebase-admin");
const agents_1 = require("./agents");
class AgentOrchestrator {
    issueId;
    apiKey;
    db;
    constructor(issueId, apiKey) {
        this.issueId = issueId;
        this.apiKey = apiKey;
        this.db = admin.firestore();
    }
    async executePipeline() {
        const issueRef = this.db.collection("issues").doc(this.issueId);
        // 1. Load the issue document
        const issueSnap = await issueRef.get();
        if (!issueSnap.exists) {
            throw new Error(`Issue document with ID ${this.issueId} does not exist.`);
        }
        const issueData = issueSnap.data();
        console.log(`[Orchestrator] Starting multi-agent pipeline for Issue #${this.issueId}`);
        // Fetch nearby issues in the same ward for Duplicate Detection Agent
        let nearbyIssues = [];
        try {
            const ward = issueData.location?.ward;
            if (ward) {
                const querySnap = await this.db
                    .collection("issues")
                    .where("location.ward", "==", ward)
                    .where("status", "!=", "closed")
                    .limit(6)
                    .get();
                querySnap.forEach((doc) => {
                    if (doc.id !== this.issueId) {
                        nearbyIssues.push({ id: doc.id, ...doc.data() });
                    }
                });
            }
        }
        catch (e) {
            console.warn("Failed to fetch nearby issues:", e);
        }
        // 2. Initialize Case Memory
        const caseMemory = {
            timeline: ["pipeline_started"],
            evidenceHistory: [...(issueData.aiAnalysis?.contextFactors || [])],
            confidenceHistory: [
                { agentId: "initial_visual", confidence: issueData.aiAnalysis?.confidence || 80, timestamp: new Date() }
            ],
            reasoningHistory: [],
            agentNotes: [],
            decisionRevisions: [],
            consensus: {}
        };
        const agentResults = {
            vision: {
                status: "success",
                durationMs: issueData.aiAnalysis?.processingTimeMs || 800,
                confidence: issueData.aiAnalysis?.confidence || 85,
                output: {
                    category: issueData.aiAnalysis?.category,
                    subcategory: issueData.aiAnalysis?.subcategory,
                    severity: issueData.aiAnalysis?.severity,
                    evidence: issueData.aiAnalysis?.contextFactors || [],
                    objects: issueData.aiAnalysis?.detectedObjects || [],
                    hazards: issueData.aiAnalysis?.possibleHazards || [],
                    confidence: issueData.aiAnalysis?.confidence || 85,
                }
            }
        };
        // Update document to running state
        await issueRef.update({
            pipelineStatus: "running",
            pipelineStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            agentResults,
            caseMemory
        });
        const inputDetails = {
            category: issueData.aiAnalysis?.category || "other",
            subcategory: issueData.aiAnalysis?.subcategory || "General Triage",
            severityEstimate: issueData.aiAnalysis?.severity || "medium",
            userDescription: issueData.userDescription || "",
            location: {
                lat: issueData.location?.lat || 0,
                lng: issueData.location?.lng || 0,
                address: issueData.location?.address || "",
                ward: issueData.location?.ward || ""
            }
        };
        const inputData = {
            issueDetails: inputDetails,
            previousResults: {},
            caseMemory,
            nearbyIssues
        };
        // Define Fallback Outputs
        const fallbacks = {
            duplicate: { duplicateProbability: 0, matchedIssues: [], reasoning: "Duplicate detection failed, defaulted to new report." },
            safety: { safetyLevel: "medium", affectedPopulation: "general population", emergencyRequired: false, reasoning: "Safety assessment failed." },
            priority: { priority: "medium", score: 50, reasoning: "Priority synthesis failed, assigned medium priority." },
            routing: { department: "General Municipal Department", escalationLevel: "L1", slaHours: 72, reasoning: "Routing failed, assigned standard handler." },
            executive: { summary: "Triaged report generated.", decision: "Your issue is being triaged.", nextActions: ["Review issue details"] },
            validator: { isValid: true, validationWarnings: [] }
        };
        // Helper to run individual agents
        const runAgentStep = async (agentId, agentInstance, runArgs) => {
            const startTime = Date.now();
            console.log(`[Orchestrator] Activating Agent: ${agentId}`);
            // Update running status in Firestore to show animation live
            await issueRef.update({
                [`agentResults.${agentId}`]: { status: "running", durationMs: 0, confidence: 0 }
            });
            try {
                const output = await agentInstance.run(runArgs);
                const duration = Date.now() - startTime;
                // Log Agent output in results map
                agentResults[agentId] = {
                    status: "success",
                    durationMs: duration,
                    confidence: output.confidence || 85,
                    output
                };
                // Append to memory
                caseMemory.timeline.push(`${agentId}_completed`);
                caseMemory.confidenceHistory.push({
                    agentId,
                    confidence: output.confidence || 85,
                    timestamp: new Date()
                });
                caseMemory.reasoningHistory.push({
                    agentId,
                    reasoning: output.reasoning || output.findings || ""
                });
                if (output.commentsForNextAgent) {
                    caseMemory.agentNotes.push(`[${agentId}]: ${output.commentsForNextAgent}`);
                }
                if (output.decisionRevision) {
                    caseMemory.decisionRevisions.push({
                        agentId,
                        ...output.decisionRevision,
                        timestamp: new Date()
                    });
                }
                if (Array.isArray(output.evidence) && output.evidence.length > 0) {
                    caseMemory.evidenceHistory.push(...output.evidence);
                }
                // Save progress to Firestore sequentially
                await issueRef.update({
                    [`agentResults.${agentId}`]: agentResults[agentId],
                    caseMemory
                });
            }
            catch (err) {
                console.error(`[Orchestrator] Agent ${agentId} failed:`, err);
                const duration = Date.now() - startTime;
                agentResults[agentId] = {
                    status: "failed",
                    durationMs: duration,
                    confidence: 0,
                    output: fallbacks[agentId],
                    error: err.message || "Unknown execution error"
                };
                caseMemory.timeline.push(`${agentId}_failed`);
                caseMemory.agentNotes.push(`[${agentId}]: Encountered execution error. Executed fallback.`);
                await issueRef.update({
                    [`agentResults.${agentId}`]: agentResults[agentId],
                    caseMemory
                });
            }
            // Populate input data for next agents
            inputData.previousResults[agentId] = agentResults[agentId].output;
            inputData.caseMemory = caseMemory;
        };
        // Instantiate Agents
        const duplicateAgent = new agents_1.DuplicateAgent(this.apiKey);
        const safetyAgent = new agents_1.SafetyAgent(this.apiKey);
        const priorityAgent = new agents_1.PriorityAgent(this.apiKey);
        const routingAgent = new agents_1.RoutingAgent(this.apiKey);
        const executiveAgent = new agents_1.ExecutiveAgent(this.apiKey);
        const validatorAgent = new agents_1.ValidatorAgent(this.apiKey);
        // Run Vision mapping step
        inputData.previousResults.vision = agentResults.vision.output;
        // Run sequential steps
        await runAgentStep("duplicate", duplicateAgent, inputData);
        await runAgentStep("safety", safetyAgent, inputData);
        await runAgentStep("priority", priorityAgent, inputData);
        await runAgentStep("routing", routingAgent, inputData);
        await runAgentStep("executive", executiveAgent, inputData);
        await runAgentStep("validator", validatorAgent, inputData);
        console.log(`[Orchestrator] Completed all council agents for Issue #${this.issueId}`);
        // Update main fields with final synthesized values
        const finalPriority = inputData.previousResults.priority || fallbacks.priority;
        const finalRouting = inputData.previousResults.routing || fallbacks.routing;
        const finalExecutive = inputData.previousResults.executive || fallbacks.executive;
        const severityMap = { critical: 0, high: 1, medium: 2, low: 3 };
        const levelVal = severityMap[finalPriority.priority] ?? 2;
        const slaDeadline = new Date(Date.now() + (finalRouting.slaHours || 72) * 3600000);
        // Save final completion to Firestore
        await issueRef.update({
            pipelineStatus: "completed",
            pipelineCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Update status
            status: "community_verification", // moves to community voting phase
            // Update priority fields
            "priority.level": levelVal,
            "priority.label": finalPriority.priority?.toUpperCase() || "MEDIUM",
            "priority.score": finalPriority.score || 50,
            "priority.citizenReason": finalExecutive.decision || "Urgency evaluated by City Council",
            "priority.estimatedSLAHours": finalRouting.slaHours || 72,
            "priority.slaDeadline": slaDeadline,
            // Update routing
            "routing.primaryDepartment": finalRouting.department || "General Municipal Services",
            "routing.escalationLevel": finalRouting.escalationLevel || "L1",
            "routing.routingReason": finalRouting.findings || "Routed by Routing Agent",
            // Update summaries
            "aiAnalysis.aiDescription": finalExecutive.summary || issueData.userDescription,
            "aiAnalysis.citizenMessage": finalExecutive.decision || "Issue report received.",
            // execution logs and history
            decisionLog: caseMemory.decisionRevisions,
            confidenceHistory: caseMemory.confidenceHistory,
            executionMetrics: {
                totalDurationMs: Object.values(agentResults).reduce((sum, current) => sum + (current.durationMs || 0), 0),
                agentsExecutedCount: Object.keys(agentResults).length,
                failuresCount: Object.values(agentResults).filter((a) => a.status === "failed").length
            }
        });
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=agentOrchestrator.js.map