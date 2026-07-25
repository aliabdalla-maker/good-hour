import { prisma } from "@gihtcx/db";
import type { AgentType } from "@gihtcx/shared";

export interface LogAgentDecisionInput {
  agentType: AgentType;
  subjectType: string;
  subjectId: string;
  inputSnapshot: unknown;
  promptVersion: string;
  modelUsed: string;
  rawModelOutput: unknown;
  parsedDecision: unknown;
  reasoning?: string;
  latencyMs: number;
  costEstimateUsd?: number;
}

/**
 * The only write path for AgentDecisionLog. Both pricing-agent and
 * negotiation-agent must go through this so no agent decision can affect
 * price or matching state without a corresponding audit row.
 */
export async function logAgentDecision(input: LogAgentDecisionInput) {
  return prisma.agentDecisionLog.create({
    data: {
      agentType: input.agentType,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      inputSnapshot: input.inputSnapshot as object,
      promptVersion: input.promptVersion,
      modelUsed: input.modelUsed,
      rawModelOutput: input.rawModelOutput as object,
      parsedDecision: input.parsedDecision as object,
      reasoning: input.reasoning,
      latencyMs: input.latencyMs,
      costEstimateUsd: input.costEstimateUsd,
    },
  });
}

export async function recordAgentOutcome(logId: string, accepted: boolean) {
  return prisma.agentDecisionLog.update({
    where: { id: logId },
    data: { outcomeAccepted: accepted },
  });
}
