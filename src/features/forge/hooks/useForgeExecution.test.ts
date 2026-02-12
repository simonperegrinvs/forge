// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeNextPhasePrompt,
  ForgePhaseStatus,
  ForgeRunPhaseChecksResponse,
} from "../../../services/tauri";
import { useForgeExecution } from "./useForgeExecution";

type HookArgs = Parameters<typeof useForgeExecution>[0];

function buildBaseArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    workspaceId: "ws-1",
    knownTaskIds: ["task-1"],
    connectWorkspace: async () => {},
    prepareExecution: async () => {},
    getNextPhasePrompt: async () => null,
    getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
    runPhaseChecks: async () => ({ ok: true, results: [] }),
    interruptTurn: async () => ({}),
    startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
    sendUserMessage: async () => ({ result: { turn: { id: "turn-1" } } }),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useForgeExecution execution limits", () => {
  it("fails execution when phase status never reaches a terminal state before timeout", async () => {
    vi.useFakeTimers();

    const getNextPhasePrompt = vi
      .fn<HookArgs["getNextPhasePrompt"]>()
      .mockResolvedValue({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: false,
        promptText: "phase prompt",
      } satisfies ForgeNextPhasePrompt);

    const getPhaseStatus = vi
      .fn<HookArgs["getPhaseStatus"]>()
      .mockResolvedValue({ status: "pending", commitSha: null } satisfies ForgePhaseStatus);

    const runPhaseChecks = vi
      .fn<HookArgs["runPhaseChecks"]>()
      .mockResolvedValue({ ok: true, results: [] } satisfies ForgeRunPhaseChecksResponse);

    const { result } = renderHook(() =>
      useForgeExecution({
        ...buildBaseArgs({
          getNextPhasePrompt,
          getPhaseStatus,
          runPhaseChecks,
        }),
        executionLimits: {
          phaseStatusPollIntervalMs: 10,
          phaseStatusTimeoutMs: 40,
          maxPhaseCheckFailures: 2,
        },
      } as HookArgs & {
        executionLimits: {
          phaseStatusPollIntervalMs: number;
          phaseStatusTimeoutMs: number;
          maxPhaseCheckFailures: number;
        };
      }),
    );

    await act(async () => {
      void result.current.startExecution("alpha");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(result.current.lastError).toContain("timed out");
    expect(runPhaseChecks).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.pauseExecution();
    });
  });

  it("fails execution after max repeated phase-check failures", async () => {
    vi.useFakeTimers();

    const phase: ForgeNextPhasePrompt = {
      planId: "alpha",
      taskId: "task-1",
      phaseId: "implementation",
      isLastPhase: false,
      promptText: "phase prompt",
    };
    const getNextPhasePrompt = vi
      .fn<HookArgs["getNextPhasePrompt"]>()
      .mockResolvedValue(phase);
    const getPhaseStatus = vi
      .fn<HookArgs["getPhaseStatus"]>()
      .mockResolvedValue({ status: "completed", commitSha: null } satisfies ForgePhaseStatus);
    const runPhaseChecks = vi
      .fn<HookArgs["runPhaseChecks"]>()
      .mockResolvedValue({ ok: false, results: [] } satisfies ForgeRunPhaseChecksResponse);

    const { result } = renderHook(() =>
      useForgeExecution({
        ...buildBaseArgs({
          getNextPhasePrompt,
          getPhaseStatus,
          runPhaseChecks,
        }),
        executionLimits: {
          phaseStatusPollIntervalMs: 10,
          phaseStatusTimeoutMs: 200,
          maxPhaseCheckFailures: 2,
        },
      } as HookArgs & {
        executionLimits: {
          phaseStatusPollIntervalMs: number;
          phaseStatusTimeoutMs: number;
          maxPhaseCheckFailures: number;
        };
      }),
    );

    await act(async () => {
      void result.current.startExecution("alpha");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(result.current.lastError).toContain("reached max check failures");
    expect(runPhaseChecks).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.pauseExecution();
    });
  });
});
