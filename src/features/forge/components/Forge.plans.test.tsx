// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollaborationModeOption } from "../../../types";
import { Forge, type ForgePlansClient, type ForgeTemplatesClient } from "./Forge";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const templatesClient: ForgeTemplatesClient = {
  listBundledTemplates: async () => [],
  getInstalledTemplate: async () => null,
  installTemplate: async () => {
    throw new Error("unexpected install");
  },
  uninstallTemplate: async () => {
    throw new Error("unexpected uninstall");
  },
};

describe("Forge plans", () => {
  it("lists workspace plans and enables the execute toggle after selecting one", async () => {
    const getNextPhasePrompt = vi
      .fn<ForgePlansClient["getNextPhasePrompt"]>()
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "execute prompt",
      })
      .mockResolvedValueOnce(null);

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            {
              id: "task-1",
              name: "Task 1",
              status: "pending",
            },
          ],
          currentTaskId: null,
          planPath: "plans/alpha.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt,
      getPhaseStatus: async () => ({ status: "completed", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({}),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    const runButton = await screen.findByRole("button", { name: "Resume plan" });
    expect(runButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));

    expect(screen.getByRole("button", { name: "Resume plan" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    expect(await screen.findByRole("button", { name: "Pause plan" })).toBeTruthy();
  });

  it("polls for new plans and updates the menu automatically", async () => {
    vi.useFakeTimers();

    const listPlans = vi
      .fn<ForgePlansClient["listPlans"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            {
              id: "task-1",
              name: "Task 1",
              status: "pending",
            },
          ],
          currentTaskId: null,
          planPath: "plans/alpha.json",
          updatedAtMs: 0,
        },
      ]);

    const plansClient: ForgePlansClient = {
      listPlans,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({}),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Click to select/i }));

    expect(screen.queryByText("Alpha (alpha)")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(listPlans).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" })).toBeTruthy();
  });

  it("starts a new plan thread in plan mode and injects the plan prompt", async () => {
    const connectWorkspace = vi.fn(async () => {});
    const startThread = vi.fn(async () => ({ result: { thread: { id: "thread-123" } } }));
    const getPlanPrompt = vi.fn(async () => "# Mode: plan\nReady flow...");
    const sendUserMessage = vi.fn(async () => ({}));
    const sendUserMessageToThread = vi.fn(async () => {});
    const onSelectThread = vi.fn();
    const onSelectCollaborationMode = vi.fn();

    const plansClient: ForgePlansClient = {
      listPlans: async () => [],
      getPlanPrompt,
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace,
      startThread,
      sendUserMessage,
    };

    const collaborationModes = [
      { id: "plan", mode: "plan", model: "o3", reasoningEffort: "medium" },
    ] as CollaborationModeOption[];

    render(
      <Forge
        activeWorkspaceId="ws-1"
        activeWorkspace={{
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        }}
        sendUserMessageToThread={sendUserMessageToThread}
        templatesClient={templatesClient}
        plansClient={plansClient}
        onSelectThread={onSelectThread}
        collaborationModes={collaborationModes}
        onSelectCollaborationMode={onSelectCollaborationMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByText("New plan..."));

    await waitFor(() => expect(onSelectCollaborationMode).toHaveBeenCalledWith("plan"));
    await waitFor(() => expect(connectWorkspace).toHaveBeenCalledWith("ws-1"));
    await waitFor(() => expect(startThread).toHaveBeenCalledWith("ws-1"));
    await waitFor(() => expect(onSelectThread).toHaveBeenCalledWith("ws-1", "thread-123"));
    await waitFor(() => expect(getPlanPrompt).toHaveBeenCalledWith("ws-1"));

    await waitFor(() =>
      expect(sendUserMessageToThread).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ws-1" }),
        "thread-123",
        "# Mode: plan\nReady flow...",
        [],
        expect.objectContaining({
          collaborationMode: expect.objectContaining({
            mode: "plan",
            settings: expect.objectContaining({
              model: "o3",
            }),
          }),
        }),
      ),
    );
  });

  it("starts a new thread for each task transition during execution", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-1" } } })
      .mockResolvedValueOnce({ result: { thread: { id: "thread-2" } } });
    const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});
    const getNextPhasePrompt = vi
      .fn<ForgePlansClient["getNextPhasePrompt"]>()
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 1 prompt",
      })
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-2",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 2 prompt",
      })
      .mockResolvedValueOnce(null);
    const onSelectThread = vi.fn();

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            { id: "task-1", name: "Task 1", status: "pending" },
            { id: "task-2", name: "Task 2", status: "pending" },
          ],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt,
      getPhaseStatus: async () => ({ status: "completed", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread,
      sendUserMessage,
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        onSelectThread={onSelectThread}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(startThread).toHaveBeenCalledTimes(2));
    expect(startThread).toHaveBeenNthCalledWith(1, "ws-1");
    expect(startThread).toHaveBeenNthCalledWith(2, "ws-1");
    await waitFor(() =>
      expect(sendUserMessage).toHaveBeenNthCalledWith(
        1,
        "ws-1",
        "thread-1",
        "task 1 prompt",
        expect.any(Object),
      ),
    );
    await waitFor(() =>
      expect(sendUserMessage).toHaveBeenNthCalledWith(
        2,
        "ws-1",
        "thread-2",
        "task 2 prompt",
        expect.any(Object),
      ),
    );
    expect(onSelectThread).toHaveBeenNthCalledWith(1, "ws-1", "thread-1");
    expect(onSelectThread).toHaveBeenNthCalledWith(2, "ws-1", "thread-2");
  });

  it("reuses a task thread across phases and rotates only on task change", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-1" } } })
      .mockResolvedValueOnce({ result: { thread: { id: "thread-2" } } });
    const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});
    const getNextPhasePrompt = vi
      .fn<ForgePlansClient["getNextPhasePrompt"]>()
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: false,
        promptText: "task 1 phase 1",
      })
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "verification",
        isLastPhase: true,
        promptText: "task 1 phase 2",
      })
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-2",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 2 phase 1",
      })
      .mockResolvedValueOnce(null);
    const onSelectThread = vi.fn();

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            { id: "task-1", name: "Task 1", status: "pending" },
            { id: "task-2", name: "Task 2", status: "pending" },
          ],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt,
      getPhaseStatus: async () => ({ status: "completed", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread,
      sendUserMessage,
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        onSelectThread={onSelectThread}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(3));
    expect(startThread).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(sendUserMessage).toHaveBeenNthCalledWith(
        1,
        "ws-1",
        "thread-1",
        "task 1 phase 1",
        expect.any(Object),
      ),
    );
    await waitFor(() =>
      expect(sendUserMessage).toHaveBeenNthCalledWith(
        2,
        "ws-1",
        "thread-1",
        "task 1 phase 2",
        expect.any(Object),
      ),
    );
    await waitFor(() =>
      expect(sendUserMessage).toHaveBeenNthCalledWith(
        3,
        "ws-1",
        "thread-2",
        "task 2 phase 1",
        expect.any(Object),
      ),
    );
    expect(onSelectThread).toHaveBeenNthCalledWith(1, "ws-1", "thread-1");
    expect(onSelectThread).toHaveBeenNthCalledWith(2, "ws-1", "thread-2");
  });

  it("pauses by interrupting the active forge turn", async () => {
    const interruptTurn = vi.fn(async () => ({}));
    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 1 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn,
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({ result: { turn: { id: "turn-1" } } }),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pause plan" }));

    await waitFor(() =>
      expect(interruptTurn).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1"),
    );
  });

  it("cleans plan progress from the selected state with confirmation", async () => {
    const listPlans = vi.fn<ForgePlansClient["listPlans"]>().mockResolvedValue([
      {
        id: "alpha",
        title: "Alpha",
        goal: "Alpha goal",
        tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
        currentTaskId: null,
        planPath: "plans/alpha/plan.json",
        updatedAtMs: 0,
      },
    ]);
    const resetExecutionProgress = vi.fn(async () => {});
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    const plansClient: ForgePlansClient = {
      listPlans,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress,
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({}),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Clean progress" }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(resetExecutionProgress).toHaveBeenCalledWith("ws-1", "alpha"),
    );
    await waitFor(() => expect(listPlans).toHaveBeenCalledTimes(2));

    confirmMock.mockRestore();
  });

  it("shows in-progress task and phase while execution is running", async () => {
    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 1 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({}),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    expect(await screen.findByText("Phase implementation in progress")).toBeTruthy();
    const row = screen.getByText("Task 1").closest("li");
    expect(row?.className.includes("inProgress")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
  });

  it("renders ordered phase chips with status classes and keeps failed ai-review blocking", async () => {
    const loadPhaseView = vi
      .fn<NonNullable<ForgePlansClient["loadPhaseView"]>>()
      .mockResolvedValue({
        phases: [
          {
            id: "test-case-mapping",
            title: "Test Case Mapping",
            iconId: "taskfile",
            order: 1,
          },
          {
            id: "behavioral-tests",
            title: "Behavioral Tests",
            iconId: "cucumber",
            order: 2,
          },
          {
            id: "implementation",
            title: "Implementation",
            iconId: "console",
            order: 3,
          },
          {
            id: "coverage-hardening",
            title: "Coverage Hardening",
            iconId: "codecov",
            order: 4,
          },
          {
            id: "documentation",
            title: "Documentation",
            iconId: "readme",
            order: 5,
          },
          {
            id: "ai-review",
            title: "AI Review Gate",
            iconId: "totally-invalid-icon",
            order: 6,
          },
        ],
        taskPhaseStatusByTaskId: {
          "task-1": {
            "test-case-mapping": "completed",
            "behavioral-tests": "in_progress",
            implementation: "pending",
            "coverage-hardening": "failed",
            documentation: "pending",
            "ai-review": "failed",
          },
        },
      });

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      loadPhaseView,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage: async () => ({}),
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));

    await waitFor(() =>
      expect(loadPhaseView).toHaveBeenCalledWith("ws-1", "alpha", null),
    );

    const taskRow = screen.getByText("Task 1").closest("li");
    expect(taskRow).toBeTruthy();
    const rowElement = taskRow as HTMLLIElement;
    const chips = Array.from(rowElement.querySelectorAll(".forge-phase"));
    expect(chips.map((chip) => chip.getAttribute("data-phase-id"))).toEqual([
      "test-case-mapping",
      "behavioral-tests",
      "implementation",
      "coverage-hardening",
      "documentation",
      "ai-review",
    ]);
    expect(
      chips.map((chip) =>
        chip.querySelector(".forge-phase-name")?.textContent?.trim(),
      ),
    ).toEqual([
      "Test Case Mapping",
      "Behavioral Tests",
      "Implementation",
      "Coverage Hardening",
      "Documentation",
      "AI Review Gate",
    ]);

    const chipFor = (phaseId: string) =>
      rowElement.querySelector(`.forge-phase[data-phase-id="${phaseId}"]`) as HTMLElement | null;

    expect(chipFor("test-case-mapping")?.className.includes("is-complete")).toBe(true);
    expect(chipFor("behavioral-tests")?.className.includes("is-current")).toBe(true);
    expect(chipFor("implementation")?.className.includes("is-pending")).toBe(true);
    expect(chipFor("coverage-hardening")?.className.includes("is-pending")).toBe(true);
    expect(chipFor("documentation")?.className.includes("is-pending")).toBe(true);
    expect(chipFor("ai-review")?.className.includes("is-pending")).toBe(true);
    expect(chipFor("ai-review")?.className.includes("is-complete")).toBe(false);

    const behavioralIcon = chipFor("behavioral-tests")
      ?.querySelector(".forge-phase-icon img")
      ?.getAttribute("src");
    const aiReviewIcon = chipFor("ai-review")
      ?.querySelector(".forge-phase-icon img")
      ?.getAttribute("src");

    expect(behavioralIcon).toBe("/assets/material-icons/cucumber.svg");
    expect(aiReviewIcon).toBe("/assets/material-icons/file.svg");
  });

  it("keeps a pending phase on a single prompt without auto-resending", async () => {
    vi.useFakeTimers();

    const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});
    const interruptTurn = vi.fn<ForgePlansClient["interruptTurn"]>().mockResolvedValue({});
    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 1 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn,
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage,
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause plan" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300000);
    });

    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(interruptTurn).toHaveBeenCalledWith("ws-1", "thread-1", "pending");
  });

  it("stops execution when a phase reports a terminal non-completed status", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runPhaseChecks = vi.fn<ForgePlansClient["runPhaseChecks"]>().mockResolvedValue({
      ok: true,
      results: [],
    });
    const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});
    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [{ id: "task-1", name: "Task 1", status: "pending" }],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 1 prompt",
      }),
      getPhaseStatus: async () => ({ status: "failed", commitSha: null }),
      runPhaseChecks,
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-1" } } }),
      sendUserMessage,
    };

    render(
      <Forge
        activeWorkspaceId="ws-1"
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain('terminal status "failed"'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "Forge execution failed.",
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    expect(runPhaseChecks).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();
    warnSpy.mockRestore();
  });
});
