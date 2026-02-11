import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ForgeNextPhasePrompt,
  ForgePhaseStatus,
  ForgeRunPhaseChecksResponse,
} from "../../../services/tauri";

type ForgeExecutionStatusLike =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "canceled"
  | string;

type ForgeExecutionArgs = {
  workspaceId: string | null;
  connectWorkspace: (workspaceId: string) => Promise<void>;
  prepareExecution: (workspaceId: string, planId: string) => Promise<void>;
  getNextPhasePrompt: (
    workspaceId: string,
    planId: string,
  ) => Promise<ForgeNextPhasePrompt | null>;
  getPhaseStatus: (
    workspaceId: string,
    planId: string,
    taskId: string,
    phaseId: string,
  ) => Promise<ForgePhaseStatus>;
  runPhaseChecks: (
    workspaceId: string,
    planId: string,
    taskId: string,
    phaseId: string,
  ) => Promise<ForgeRunPhaseChecksResponse>;
  startThread: (workspaceId: string) => Promise<unknown>;
  sendUserMessage: (
    workspaceId: string,
    threadId: string,
    text: string,
    options?: {
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<unknown>;
  onSelectThread?: (workspaceId: string, threadId: string) => void;
  collaborationMode?: Record<string, unknown> | null;
};

type ForgeRunningInfo = {
  taskId: string;
  phaseId: string;
};

type ForgeExecutionState = {
  isExecuting: boolean;
  runningInfo: ForgeRunningInfo | null;
  startExecution: (planId: string) => Promise<void>;
  pauseExecution: () => void;
};

const POLL_INTERVAL_MS = 1200;

function isFinalPhaseStatus(status: ForgeExecutionStatusLike): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "success" ||
    normalized === "succeeded" ||
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  );
}

function extractThreadId(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const directThread = (response as { thread?: { id?: unknown } }).thread;
  const nestedThread = (response as { result?: { thread?: { id?: unknown } } }).result?.thread;
  const id = directThread?.id ?? nestedThread?.id ?? null;
  if (typeof id !== "string") {
    return null;
  }

  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useForgeExecution({
  workspaceId,
  connectWorkspace,
  prepareExecution,
  getNextPhasePrompt,
  getPhaseStatus,
  runPhaseChecks,
  startThread,
  sendUserMessage,
  onSelectThread,
  collaborationMode = null,
}: ForgeExecutionArgs): ForgeExecutionState {
  const [isExecuting, setIsExecuting] = useState(false);
  const [runningInfo, setRunningInfo] = useState<ForgeRunningInfo | null>(null);
  const runTokenRef = useRef(0);
  const activeRunRef = useRef<number | null>(null);

  const clearExecutionState = useCallback(() => {
    setIsExecuting(false);
    setRunningInfo(null);
  }, []);

  const pauseExecution = useCallback(() => {
    runTokenRef.current += 1;
    activeRunRef.current = null;
    clearExecutionState();
  }, [clearExecutionState]);

  useEffect(() => {
    return () => {
      runTokenRef.current += 1;
      activeRunRef.current = null;
    };
  }, []);

  const startExecution = useCallback(
    async (planId: string) => {
      const workspace = workspaceId?.trim();
      const normalizedPlanId = planId.trim();
      if (!workspace || !normalizedPlanId || activeRunRef.current !== null) {
        return;
      }

      const token = runTokenRef.current + 1;
      runTokenRef.current = token;
      activeRunRef.current = token;
      setIsExecuting(true);
      setRunningInfo(null);

      const isActive = () => activeRunRef.current === token && runTokenRef.current === token;

      try {
        await connectWorkspace(workspace);
        if (!isActive()) {
          return;
        }

        await prepareExecution(workspace, normalizedPlanId);
        if (!isActive()) {
          return;
        }

        let activeThreadId: string | null = null;
        let activeThreadTaskId: string | null = null;
        const completedPhases = new Set<string>();

        while (isActive()) {
          const phase = await getNextPhasePrompt(workspace, normalizedPlanId);
          if (!isActive()) {
            return;
          }
          if (!phase) {
            return;
          }

          const phaseKey = `${phase.taskId}:${phase.phaseId}`;
          if (completedPhases.has(phaseKey)) {
            await wait(POLL_INTERVAL_MS);
            continue;
          }

          if (!activeThreadId || activeThreadTaskId !== phase.taskId) {
            const threadResponse = await startThread(workspace);
            if (!isActive()) {
              return;
            }

            const threadId = extractThreadId(threadResponse);
            if (!threadId) {
              throw new Error("Forge execution start thread response missing thread id.");
            }

            activeThreadId = threadId;
            activeThreadTaskId = phase.taskId;
            onSelectThread?.(workspace, threadId);
          }

          setRunningInfo({ taskId: phase.taskId, phaseId: phase.phaseId });

          const threadId = activeThreadId;
          if (!threadId) {
            throw new Error("Forge execution thread id is missing.");
          }
          await sendUserMessage(workspace, threadId, phase.promptText, { collaborationMode });
          if (!isActive()) {
            return;
          }

          while (isActive()) {
            const phaseStatus = await getPhaseStatus(
              workspace,
              normalizedPlanId,
              phase.taskId,
              phase.phaseId,
            );
            if (!isActive()) {
              return;
            }
            if (isFinalPhaseStatus(phaseStatus.status)) {
              break;
            }
            await wait(POLL_INTERVAL_MS);
          }

          if (!isActive()) {
            return;
          }

          const checks = await runPhaseChecks(
            workspace,
            normalizedPlanId,
            phase.taskId,
            phase.phaseId,
          );
          if (!checks.ok) {
            await wait(POLL_INTERVAL_MS);
            continue;
          }
          completedPhases.add(phaseKey);
        }
      } catch (error) {
        console.warn("Forge execution failed.", { error });
      } finally {
        if (activeRunRef.current === token) {
          activeRunRef.current = null;
          clearExecutionState();
        }
      }
    },
    [
      clearExecutionState,
      collaborationMode,
      connectWorkspace,
      getNextPhasePrompt,
      getPhaseStatus,
      onSelectThread,
      prepareExecution,
      runPhaseChecks,
      sendUserMessage,
      startThread,
      workspaceId,
    ],
  );

  return useMemo(
    () => ({
      isExecuting,
      runningInfo,
      startExecution,
      pauseExecution,
    }),
    [isExecuting, pauseExecution, runningInfo, startExecution],
  );
}
