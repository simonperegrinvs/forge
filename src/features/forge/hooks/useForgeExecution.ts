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
  interruptTurn: (
    workspaceId: string,
    threadId: string,
    turnId: string,
  ) => Promise<unknown>;
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
  lastError: string | null;
  startExecution: (planId: string) => Promise<void>;
  pauseExecution: () => Promise<void>;
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
    normalized === "blocked" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  );
}

function isCompletedPhaseStatus(status: ForgeExecutionStatusLike): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "success" ||
    normalized === "succeeded"
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

function extractTurnId(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const directTurn = (response as { turn?: { id?: unknown } }).turn;
  const nestedTurn = (response as { result?: { turn?: { id?: unknown } } }).result?.turn;
  const id = directTurn?.id ?? nestedTurn?.id ?? null;
  if (typeof id !== "string") {
    return null;
  }

  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeStartThreadResponse(response: unknown): string {
  if (response == null) {
    return String(response);
  }
  if (typeof response !== "object") {
    return typeof response;
  }
  try {
    const serialized = JSON.stringify(response);
    if (!serialized) {
      return "empty object";
    }
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return "unserializable object";
  }
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
  interruptTurn,
  startThread,
  sendUserMessage,
  onSelectThread,
  collaborationMode = null,
}: ForgeExecutionArgs): ForgeExecutionState {
  const [isExecuting, setIsExecuting] = useState(false);
  const [runningInfo, setRunningInfo] = useState<ForgeRunningInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const runTokenRef = useRef(0);
  const activeRunRef = useRef<number | null>(null);
  const activeTurnRef = useRef<{
    workspaceId: string;
    threadId: string;
    turnId: string;
  } | null>(null);

  const clearExecutionState = useCallback(() => {
    setIsExecuting(false);
    setRunningInfo(null);
  }, []);

  const pauseExecution = useCallback(async () => {
    const activeTurn = activeTurnRef.current;
    activeTurnRef.current = null;
    runTokenRef.current += 1;
    activeRunRef.current = null;
    clearExecutionState();
    if (!activeTurn) {
      return;
    }

    try {
      await interruptTurn(
        activeTurn.workspaceId,
        activeTurn.threadId,
        activeTurn.turnId || "pending",
      );
    } catch (error) {
      console.warn("Forge execution pause interrupt failed.", { error });
    }
  }, [clearExecutionState, interruptTurn]);

  useEffect(() => {
    return () => {
      activeTurnRef.current = null;
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
      activeTurnRef.current = null;
      setIsExecuting(true);
      setRunningInfo(null);
      setLastError(null);

      const isActive = () => activeRunRef.current === token && runTokenRef.current === token;

      const waitForPhaseFinalStatus = async (
        taskId: string,
        phaseId: string,
      ): Promise<ForgeExecutionStatusLike | null> => {
        while (isActive()) {
          const phaseStatus = await getPhaseStatus(
            workspace,
            normalizedPlanId,
            taskId,
            phaseId,
          );
          if (!isActive()) {
            return null;
          }
          if (isFinalPhaseStatus(phaseStatus.status)) {
            return phaseStatus.status;
          }
          await wait(POLL_INTERVAL_MS);
        }
        return null;
      };

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
        const threadByTaskId = new Map<string, string>();

        while (isActive()) {
          const phase = await getNextPhasePrompt(workspace, normalizedPlanId);
          if (!isActive()) {
            return;
          }
          if (!phase) {
            return;
          }
          const taskId = phase.taskId.trim();
          if (!taskId) {
            throw new Error("Forge next phase prompt returned an empty task id.");
          }
          const phaseId = phase.phaseId.trim();
          if (!phaseId) {
            throw new Error("Forge next phase prompt returned an empty phase id.");
          }

          const mappedThreadId = threadByTaskId.get(taskId) ?? null;
          if (!mappedThreadId) {
            const previousTaskId = activeThreadTaskId;
            const previousThreadId = activeThreadId;
            activeTurnRef.current = null;
            const threadResponse = await startThread(workspace);
            if (!isActive()) {
              return;
            }

            const threadId = extractThreadId(threadResponse);
            if (!threadId) {
              throw new Error(
                `Forge execution start thread response missing thread id (response=${summarizeStartThreadResponse(
                  threadResponse,
                )}).`,
              );
            }

            threadByTaskId.set(taskId, threadId);
            activeThreadId = threadId;
            activeThreadTaskId = taskId;
            if (
              previousTaskId &&
              previousTaskId !== taskId &&
              previousThreadId &&
              previousThreadId === threadId
            ) {
              console.warn("Forge execution task transition reused a thread id.", {
                previousTaskId,
                previousThreadId,
                taskId,
                threadId,
              });
            }
            onSelectThread?.(workspace, threadId);
          } else {
            activeThreadId = mappedThreadId;
            activeThreadTaskId = taskId;
          }

          setRunningInfo({ taskId, phaseId });

          const threadId = activeThreadId;
          if (!threadId) {
            throw new Error("Forge execution thread id is missing.");
          }
          activeTurnRef.current = {
            workspaceId: workspace,
            threadId,
            turnId: "pending",
          };
          const turnResponse = await sendUserMessage(workspace, threadId, phase.promptText, {
            collaborationMode,
          });
          if (!isActive()) {
            return;
          }
          const turnId = extractTurnId(turnResponse);
          if (turnId && activeTurnRef.current?.threadId === threadId) {
            activeTurnRef.current = {
              workspaceId: workspace,
              threadId,
              turnId,
            };
          }

          const lastPhaseStatus = await waitForPhaseFinalStatus(taskId, phaseId);

          if (!isActive()) {
            return;
          }
          activeTurnRef.current = null;

          if (lastPhaseStatus === null) {
            return;
          }

          if (!isCompletedPhaseStatus(lastPhaseStatus)) {
            throw new Error(
              `Phase ${taskId}/${phaseId} reached terminal status "${lastPhaseStatus}" before completion.`,
            );
          }

          const checks = await runPhaseChecks(
            workspace,
            normalizedPlanId,
            taskId,
            phaseId,
          );
          if (!checks.ok) {
            await wait(POLL_INTERVAL_MS);
            continue;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message.trim()
            : String(error);
        setLastError(`Forge execution failed: ${message}`);
        console.warn("Forge execution failed.", { error });
      } finally {
        if (activeRunRef.current === token) {
          activeTurnRef.current = null;
        }
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
      lastError,
      startExecution,
      pauseExecution,
    }),
    [isExecuting, lastError, pauseExecution, runningInfo, startExecution],
  );
}
