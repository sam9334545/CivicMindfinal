import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, Copy, ShieldAlert, ListOrdered, Building, BookOpen, CheckCircle2,
  AlertTriangle, Loader2, Clock, Cpu, ChevronDown, ChevronUp, ArrowLeft,
  TrendingUp, Zap, MessageSquare, Scale, Activity
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AgentId = "vision" | "duplicate" | "safety" | "priority" | "routing" | "executive" | "validator";
type AgentStatus = "pending" | "running" | "success" | "failed";

interface AgentResult {
  status: AgentStatus;
  durationMs?: number;
  confidence?: number;
  output?: any;
  error?: string;
}

interface IssueData {
  id: string;
  pipelineStatus?: "pending" | "running" | "completed" | "failed";
  agentResults?: Partial<Record<AgentId, AgentResult>>;
  caseMemory?: any;
  confidenceHistory?: { agentId: string; confidence: number }[];
  decisionLog?: any[];
  executionMetrics?: { totalDurationMs: number; agentsExecutedCount: number; failuresCount: number };
  aiAnalysis?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Metadata
// ─────────────────────────────────────────────────────────────────────────────

const AGENTS: {
  id: AgentId;
  name: string;
  role: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  border: string;
  thinkingMessages: string[];
}[] = [
  {
    id: "vision",
    name: "Vision Agent",
    role: "Media Intelligence Analyst",
    icon: Eye,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    border: "border-blue-200",
    thinkingMessages: ["Scanning visual media payload...", "Detecting urban infrastructure elements...", "Mapping structural defects..."],
  },
  {
    id: "duplicate",
    name: "Duplicate Agent",
    role: "Case History Investigator",
    icon: Copy,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    border: "border-orange-200",
    thinkingMessages: ["Querying nearby active reports...", "Comparing issue descriptions...", "Calculating overlap probability..."],
  },
  {
    id: "safety",
    name: "Safety Agent",
    role: "Public Risk Assessor",
    icon: ShieldAlert,
    color: "text-red-600",
    bgColor: "bg-red-50",
    border: "border-red-200",
    thinkingMessages: ["Evaluating civilian hazard level...", "Checking proximity to schools & hospitals...", "Assessing emergency protocol requirement..."],
  },
  {
    id: "priority",
    name: "Priority Agent",
    role: "Urgency Resolution Specialist",
    icon: ListOrdered,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    border: "border-purple-200",
    thinkingMessages: ["Synthesizing council input...", "Resolving severity conflicts...", "Applying SLA priority matrix..."],
  },
  {
    id: "routing",
    name: "Routing Agent",
    role: "Department Assignment Officer",
    icon: Building,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    border: "border-indigo-200",
    thinkingMessages: ["Consulting department directory...", "Calculating SLA deadline...", "Confirming escalation path..."],
  },
  {
    id: "executive",
    name: "Executive Agent",
    role: "Council Summary Director",
    icon: BookOpen,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    border: "border-emerald-200",
    thinkingMessages: ["Reading all council memos...", "Drafting official summary...", "Composing citizen-friendly message..."],
  },
  {
    id: "validator",
    name: "Validator Agent",
    role: "Decision Logic Inspector",
    icon: Scale,
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    border: "border-gray-200",
    thinkingMessages: ["Checking logical consistency...", "Verifying department match...", "Validating confidence alignment..."],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const ConfidenceBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={{ width: 0 }}
      animate={{ width: `${value}%` }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />
  </div>
);

const ThinkingBubble: React.FC<{ messages: string[] }> = ({ messages }) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setMsgIndex((i) => (i + 1) % messages.length), 1800);
    return () => clearInterval(iv);
  }, [messages]);

  return (
    <div className="flex items-center space-x-2 text-xs text-gray-500 italic">
      <div className="flex space-x-0.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 bg-purple-400 rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={msgIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
        >
          {messages[msgIndex]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

const EvidenceTag: React.FC<{ text: string }> = ({ text }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 border border-gray-200">
    {text}
  </span>
);

const AgentCard: React.FC<{
  meta: typeof AGENTS[0];
  result: AgentResult | undefined;
  index: number;
  isLast: boolean;
}> = ({ meta, result, index, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const status: AgentStatus = result?.status ?? "pending";
  const Icon = meta.icon;

  const statusConfig = {
    pending: { label: "Waiting...", labelColor: "text-gray-400", badge: "bg-gray-100 text-gray-500", ring: "border-gray-200 bg-white" },
    running: { label: "Analyzing...", labelColor: "text-purple-600", badge: "bg-purple-100 text-purple-700", ring: "border-purple-300 bg-purple-50/30" },
    success: { label: "Complete", labelColor: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700", ring: meta.border + " " + meta.bgColor + "/30" },
    failed: { label: "Failed", labelColor: "text-red-600", badge: "bg-red-100 text-red-600", ring: "border-red-300 bg-red-50" },
  };

  const cfg = statusConfig[status];

  useEffect(() => {
    if (status === "success") setExpanded(true);
  }, [status]);

  const output = result?.output;
  const evidenceList: string[] = output?.evidence || [];
  const commentsForNext: string = output?.commentsForNextAgent || "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="flex items-start gap-3"
    >
      {/* Vertical Connector */}
      <div className="flex flex-col items-center shrink-0" style={{ paddingTop: "16px" }}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 ${cfg.ring} transition-all duration-500 shadow-sm`}>
          {status === "running" ? (
            <Loader2 className={`w-4 h-4 animate-spin text-purple-500`} />
          ) : status === "success" ? (
            <Icon className={`w-4 h-4 ${meta.color}`} />
          ) : status === "failed" ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <Icon className="w-4 h-4 text-gray-300" />
          )}
        </div>
        {!isLast && (
          <motion.div
            className="w-0.5 bg-gray-200 flex-1 mt-1"
            style={{ height: "20px" }}
            animate={{ backgroundColor: status === "success" ? "#10b981" : "#e5e7eb" }}
            transition={{ duration: 0.8 }}
          />
        )}
      </div>

      {/* Card */}
      <div className={`flex-1 border-2 rounded-2xl overflow-hidden transition-all duration-500 mb-3 ${cfg.ring} shadow-sm`}>
        {/* Header */}
        <button
          onClick={() => status === "success" && setExpanded((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
          disabled={status !== "success"}
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${meta.bgColor}`}>
              <Icon className={`w-4 h-4 ${meta.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">{meta.name}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
              <span className="text-xs text-gray-400">{meta.role}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {status === "success" && result?.confidence && (
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-gray-700">{result.confidence}%</div>
                <div className="text-[10px] text-gray-400">Confidence</div>
              </div>
            )}
            {status === "success" && result?.durationMs && (
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-gray-700">{(result.durationMs / 1000).toFixed(1)}s</div>
                <div className="text-[10px] text-gray-400">Duration</div>
              </div>
            )}
            {status === "success" && (
              <div className="text-gray-400">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            )}
          </div>
        </button>

        {/* Running — Thinking Bubble */}
        {status === "running" && (
          <div className="px-4 pb-4">
            <ThinkingBubble messages={meta.thinkingMessages} />
          </div>
        )}

        {/* Failed */}
        {status === "failed" && result?.error && (
          <div className="px-4 pb-4 text-xs text-red-600 bg-red-50 mx-4 mb-3 rounded-lg p-3 border border-red-100">
            ⚠ {result.error}. Fallback values applied, pipeline continued.
          </div>
        )}

        {/* Expanded Details */}
        <AnimatePresence>
          {expanded && status === "success" && output && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-5 space-y-4 border-t border-gray-100 pt-4">
                {/* Confidence Bar */}
                {result.confidence && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span className="font-semibold">Confidence Score</span>
                      <span className="font-bold text-gray-700">{result.confidence}%</span>
                    </div>
                    <ConfidenceBar
                      value={result.confidence}
                      color={result.confidence >= 85 ? "bg-emerald-500" : result.confidence >= 70 ? "bg-yellow-500" : "bg-red-500"}
                    />
                  </div>
                )}

                {/* Findings */}
                {output.findings && (
                  <div>
                    <p className="text-[11px] uppercase font-bold tracking-wider text-gray-400 mb-1">Findings</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{output.findings}</p>
                  </div>
                )}

                {/* Evidence */}
                {evidenceList.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase font-bold tracking-wider text-gray-400 mb-2">Evidence</p>
                    <div className="flex flex-wrap gap-1.5">
                      {evidenceList.map((ev, i) => <EvidenceTag key={i} text={ev} />)}
                    </div>
                  </div>
                )}

                {/* Key Output Fields */}
                {renderAgentOutputFields(meta.id, output)}

                {/* Comments to Next Agent */}
                {commentsForNext && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold uppercase text-amber-600 tracking-wider mb-0.5">Note for Next Agent</p>
                      <p className="text-xs text-amber-800">{commentsForNext}</p>
                    </div>
                  </div>
                )}

                {/* Decision Revision */}
                {output.decisionRevision && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-1">
                    <p className="text-[11px] font-bold uppercase text-purple-600 tracking-wider">Decision Revision</p>
                    <div className="text-xs text-purple-700">
                      <span className="line-through text-gray-400">{output.decisionRevision.originalDecision}</span>
                      <span className="mx-2">→</span>
                      <span className="font-bold">{output.decisionRevision.updatedDecision}</span>
                    </div>
                    <p className="text-xs text-purple-600">{output.decisionRevision.reasonForRevision}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

function renderAgentOutputFields(agentId: AgentId, output: any): React.ReactNode {
  const fieldMap: Record<AgentId, Record<string, string>> = {
    vision: { category: "Category", subcategory: "Subcategory", severity: "Severity" },
    duplicate: { duplicateProbability: "Duplicate Probability (%)", matchedIssues: "Matched Issues" },
    safety: { safetyLevel: "Safety Level", affectedPopulation: "Affected Population", emergencyRequired: "Emergency Required" },
    priority: { priority: "Final Priority", score: "Urgency Score" },
    routing: { department: "Department", escalationLevel: "Escalation Level", slaHours: "SLA (hours)" },
    executive: { summary: "Technical Summary", decision: "Citizen Message" },
    validator: { isValid: "Validation Passed", reEvaluationTarget: "Re-Evaluation Target" },
  };

  const fields = fieldMap[agentId] || {};
  const entries = Object.entries(fields).filter(([key]) => output[key] !== undefined);

  if (!entries.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([key, label]) => {
        let val = output[key];
        if (Array.isArray(val)) val = val.length > 0 ? val.join(", ") : "None";
        if (typeof val === "boolean") val = val ? "Yes ✓" : "No";
        if (val === null || val === undefined) val = "—";

        return (
          <div key={key} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">{String(val)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Timeline Chart
// ─────────────────────────────────────────────────────────────────────────────
const ConfidenceTimeline: React.FC<{ history: { agentId: string; confidence: number }[] }> = ({ history }) => {
  if (!history?.length) return null;
  const max = 100;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-civic-blue" />
        <h3 className="text-sm font-bold text-gray-900">Confidence Evolution</h3>
      </div>
      <div className="flex items-end gap-3 h-20">
        {history.map((entry, i) => {
          const heightPct = (entry.confidence / max) * 100;
          const color = entry.confidence >= 90 ? "bg-emerald-400" : entry.confidence >= 75 ? "bg-yellow-400" : "bg-red-400";
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[9px] font-bold text-gray-500">{entry.confidence}%</span>
              <div className="w-full flex items-end justify-center" style={{ height: "52px" }}>
                <motion.div
                  className={`w-full rounded-t-md ${color}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPct}%` }}
                  transition={{ duration: 0.7, delay: i * 0.1 }}
                  style={{ maxHeight: "52px" }}
                />
              </div>
              <span className="text-[9px] text-gray-400 text-center leading-tight capitalize">
                {entry.agentId.replace("initial_visual", "Vision")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Execution Metrics
// ─────────────────────────────────────────────────────────────────────────────
const ExecutionMetrics: React.FC<{ metrics: any }> = ({ metrics }) => {
  if (!metrics) return null;
  const totalSec = (metrics.totalDurationMs / 1000).toFixed(1);
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Total Time", value: `${totalSec}s`, icon: Clock, color: "text-blue-600" },
        { label: "Agents Run", value: metrics.agentsExecutedCount, icon: Cpu, color: "text-purple-600" },
        { label: "Failures", value: metrics.failuresCount, icon: AlertTriangle, color: metrics.failuresCount > 0 ? "text-red-600" : "text-emerald-600" },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
          <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
          <div className="text-lg font-black text-gray-900">{value}</div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">{label}</div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main PipelineViewPage
// ─────────────────────────────────────────────────────────────────────────────
export const PipelineViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [issueData, setIssueData] = useState<IssueData | null>(null);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const issueRef = doc(db, "issues", id);
    unsubRef.current = onSnapshot(issueRef, (snap) => {
      if (snap.exists()) {
        setIssueData({ id: snap.id, ...snap.data() } as IssueData);
      }
      setLoading(false);
    });
    return () => unsubRef.current?.();
  }, [id]);

  const pipelineStatus = issueData?.pipelineStatus || "pending";
  const agentResults = issueData?.agentResults || {};
  const confidenceHistory = issueData?.confidenceHistory || [];
  const executionMetrics = issueData?.executionMetrics;
  const decisionRevisions = issueData?.caseMemory?.decisionRevisions || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <Loader2 className="w-8 h-8 text-civic-blue animate-spin" />
        <p className="text-sm text-gray-500">Loading AI Council Session...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </button>

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">AI City Council</span>
            </div>
            <h1 className="text-lg font-bold">Issue #{id?.slice(0, 8)}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {issueData?.aiAnalysis?.subcategory || "Community Issue"} · Live pipeline session
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            pipelineStatus === "completed" ? "bg-emerald-500/20 text-emerald-400" :
            pipelineStatus === "running" ? "bg-purple-500/20 text-purple-400 animate-pulse" :
            pipelineStatus === "failed" ? "bg-red-500/20 text-red-400" :
            "bg-gray-700 text-gray-400"
          }`}>
            {pipelineStatus === "completed" ? "✓ Deliberation Complete" :
             pipelineStatus === "running" ? "⚡ Council Active" :
             pipelineStatus === "failed" ? "✗ Session Failed" :
             "○ Awaiting Session"}
          </div>
        </div>
      </div>

      {/* Confidence Evolution */}
      {confidenceHistory.length > 0 && <ConfidenceTimeline history={confidenceHistory} />}

      {/* Execution Metrics */}
      {pipelineStatus === "completed" && <ExecutionMetrics metrics={executionMetrics} />}

      {/* Decision Revisions */}
      {decisionRevisions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-bold text-gray-900">Decision Revisions ({decisionRevisions.length})</h3>
          </div>
          {decisionRevisions.map((rev: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
              <span className="text-gray-400 capitalize font-semibold">{rev.agentId}:</span>
              <span className="line-through text-gray-400">{rev.originalDecision}</span>
              <span className="text-gray-400">→</span>
              <span className="font-bold text-purple-700">{rev.updatedDecision}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent Discussion Timeline */}
      <div className="space-y-0">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Council Discussion</h2>
        </div>

        {AGENTS.map((agentMeta, i) => (
          <AgentCard
            key={agentMeta.id}
            meta={agentMeta}
            result={agentResults[agentMeta.id]}
            index={i}
            isLast={i === AGENTS.length - 1}
          />
        ))}
      </div>

      {/* Final Decision Call-out */}
      {pipelineStatus === "completed" && agentResults.executive?.output && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-emerald-900">City Council Decision</h3>
          </div>
          <p className="text-sm text-emerald-800 leading-relaxed">
            {agentResults.executive.output.decision}
          </p>
          {agentResults.executive.output.nextActions?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase font-bold text-emerald-600 tracking-wider">Next Actions</p>
              {agentResults.executive.output.nextActions.map((action: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {action}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate(`/issues/${id}`)}
            className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 py-2.5 rounded-xl transition-colors mt-2"
          >
            View Issue Details
          </button>
        </motion.div>
      )}

      {/* Validation Warnings */}
      {(() => {
        const valOutput = agentResults.validator?.output;
        if (valOutput?.validationWarnings && valOutput.validationWarnings.length > 0) {
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-amber-800">Validation Warnings</h4>
              </div>
              <ul className="space-y-1">
                {valOutput.validationWarnings.map((w: string, i: number) => (
                  <li key={i} className="text-xs text-amber-700">• {w}</li>
                ))}
              </ul>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
};

export default PipelineViewPage;
