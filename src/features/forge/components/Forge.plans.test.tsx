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
  it("opens templates modal, supports swap/remove actions, and closes on escape", async () => {
    const installTemplate = vi.fn(async () => ({
      schema: "forge-template-lock-v1",
      installedTemplateId: "tpl-beta",
      installedTemplateVersion: "2.0.0",
      installedAtIso: "2026-02-12T00:00:00.000Z",
      installedFiles: [],
    }));
    const uninstallTemplate = vi.fn(async () => {});
    const templatesClientWithInstall: ForgeTemplatesClient = {
      listBundledTemplates: async () => [
        { id: "tpl-alpha", title: "Alpha Template", version: "1.0.0" },
        { id: "tpl-beta", title: "Beta Template", version: "2.0.0" },
      ],
      getInstalledTemplate: async () => ({
        schema: "forge-template-lock-v1",
        installedTemplateId: "tpl-alpha",
        installedTemplateVersion: "1.0.0",
        installedAtIso: "2026-02-12T00:00:00.000Z",
        installedFiles: [],
      }),
      installTemplate,
      uninstallTemplate,
    };

    const plansClient: ForgePlansClient = {
      listPlans: async () => [],
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
        templatesClient={templatesClientWithInstall}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open templates" }));
    expect(await screen.findByText("Templates")).toBeTruthy();
    expect(screen.getByText("Alpha Template")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => expect(installTemplate).toHaveBeenCalledWith("ws-1", "tpl-beta"));
    await waitFor(() => expect(screen.queryByText("Templates")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    await waitFor(() => expect(screen.getByText("Beta Template")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(uninstallTemplate).toHaveBeenCalledWith("ws-1"));
    await waitFor(() => expect(screen.queryByText("Templates")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    await waitFor(() => expect(screen.getByText("Templates")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Templates")).toBeNull());
  });

  it("renders unknown installed template fallback text when lock is not in bundled list", async () => {
    const templatesClientWithUnknownInstall: ForgeTemplatesClient = {
      listBundledTemplates: async () => [
        { id: "tpl-known", title: "Known Template", version: "1.0.0" },
      ],
      getInstalledTemplate: async () => ({
        schema: "forge-template-lock-v1",
        installedTemplateId: "tpl-missing",
        installedTemplateVersion: "9.9.9",
        installedAtIso: "2026-02-12T00:00:00.000Z",
        installedFiles: [],
      }),
      installTemplate: async () => {
        throw new Error("unexpected install");
      },
      uninstallTemplate: async () => {},
    };

    const plansClient: ForgePlansClient = {
      listPlans: async () => [],
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
        templatesClient={templatesClientWithUnknownInstall}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open templates" }));
    expect(await screen.findByText("tpl-missing")).toBeTruthy();
    expect(screen.getByText("Installed (9.9.9)")).toBeTruthy();
  });

  it("shows a no-project blocker and disables Forge controls when no workspace is selected", async () => {
    const listPlans = vi.fn<ForgePlansClient["listPlans"]>().mockResolvedValue([]);
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
        activeWorkspaceId={null}
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    expect(
      await screen.findByText(/Select a project first to use Forge/i),
    ).toBeTruthy();

    const templatesButton = screen.getByRole("button", { name: "Open templates" });
    expect(templatesButton.hasAttribute("disabled")).toBe(true);
    const planSelectButton = screen.getByRole("button", { name: /Click to select/i });
    expect(planSelectButton.hasAttribute("disabled")).toBe(true);
    const runButton = screen.getByRole("button", { name: "Resume plan" });
    expect(runButton.hasAttribute("disabled")).toBe(true);
    const cleanProgressButton = screen.getByRole("button", { name: "Clean progress" });
    expect(cleanProgressButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(planSelectButton);
    expect(screen.queryByText("New plan...")).toBeNull();
    expect(screen.queryByText("Other...")).toBeNull();
    expect(listPlans).not.toHaveBeenCalled();
  });

  it("never calls connect/start/send plan backends in no-project mode", async () => {
    const connectWorkspace = vi.fn(async () => {});
    const startThread = vi.fn(async () => ({ result: { thread: { id: "thread-1" } } }));
    const sendUserMessage = vi.fn(async () => ({}));

    const plansClient: ForgePlansClient = {
      listPlans: async () => [],
      getPlanPrompt: async () => "",
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

    render(
      <Forge
        activeWorkspaceId={null}
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    const planSelectButton = screen.getByRole("button", { name: /Click to select/i });
    fireEvent.click(planSelectButton);
    const newPlanAction = screen.queryByText("New plan...");
    if (newPlanAction) {
      fireEvent.click(newPlanAction);
    }
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Clean progress" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(startThread).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("keeps no-project invariants under deterministic random click sequences", async () => {
    const connectWorkspace = vi.fn(async () => {});
    const startThread = vi.fn(async () => ({ result: { thread: { id: "thread-1" } } }));
    const sendUserMessage = vi.fn(async () => ({}));

    const plansClient: ForgePlansClient = {
      listPlans: async () => [],
      getPlanPrompt: async () => "",
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

    render(
      <Forge
        activeWorkspaceId={null}
        templatesClient={templatesClient}
        plansClient={plansClient}
        collaborationModes={[]}
      />,
    );

    const controls = () => ({
      templates: screen.getByRole("button", { name: "Open templates" }),
      planSelect: screen.getByRole("button", { name: /Click to select/i }),
      run: screen.getByRole("button", { name: "Resume plan" }),
      clean: screen.getByRole("button", { name: "Clean progress" }),
    });

    let seed = 1337;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };

    const actions = [
      () => fireEvent.click(controls().templates),
      () => fireEvent.click(controls().planSelect),
      () => fireEvent.click(controls().run),
      () => fireEvent.click(controls().clean),
    ];

    for (let i = 0; i < 64; i += 1) {
      await act(async () => {
        actions[next() % actions.length]();
      });
      expect(screen.getByText(/Select a project first to use Forge/i)).toBeTruthy();
      expect(screen.queryByText("New plan...")).toBeNull();
      expect(screen.queryByText("Templates")).toBeNull();
    }

    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(startThread).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

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
      .mockResolvedValueOnce({ result: { thread: { id: "thread-2" } } })
      .mockResolvedValueOnce({ result: { thread: { id: "thread-3" } } });
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

  it("stops execution with an alert when next phase task id is not visible in the selected plan", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-999" } } });
    const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});
    const getNextPhasePrompt = vi
      .fn<ForgePlansClient["getNextPhasePrompt"]>()
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-999",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "unexpected task prompt",
      })
      .mockResolvedValueOnce(null);
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
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(getNextPhasePrompt).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("unexpected task id"),
    );
    expect(startThread).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();
  });

  it("stops without creating an extra thread when an unexpected task arrives after visible tasks", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-1" } } })
      .mockResolvedValueOnce({ result: { thread: { id: "thread-2" } } })
      .mockResolvedValueOnce({ result: { thread: { id: "thread-3" } } });
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
      .mockResolvedValueOnce({
        planId: "alpha",
        taskId: "task-3",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "unexpected task prompt",
      })
      .mockResolvedValueOnce(null);

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
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(startThread).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("unexpected task id"),
    );
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
    expect(getNextPhasePrompt).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();
  });

  it("exits cleanly after final visible task when next phase returns null", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-1" } } });
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
      .mockResolvedValueOnce(null);

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
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(startThread).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getNextPhasePrompt).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();
  });

  it("preserves execution guard invariants across deterministic prompt sequences", async () => {
    const knownTasks = ["task-1", "task-2", "task-3"] as const;
    const knownTaskSet = new Set<string>(knownTasks);
    let seed = 20260212;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };

    for (let caseIndex = 0; caseIndex < 8; caseIndex += 1) {
      cleanup();

      const sequenceLength = 2 + (next() % 4); // 2..5 prompts before terminal null
      const unknownInsertionIndex = next() % (sequenceLength + 1); // if == length, no unknown
      const taskSequence: string[] = [];
      for (let i = 0; i < sequenceLength; i += 1) {
        if (unknownInsertionIndex < sequenceLength && i === unknownInsertionIndex) {
          taskSequence.push(`task-x-${caseIndex}`);
          continue;
        }
        taskSequence.push(knownTasks[next() % knownTasks.length]);
      }

      const prompts: Array<
        | {
            planId: string;
            taskId: string;
            phaseId: string;
            isLastPhase: boolean;
            promptText: string;
          }
        | null
      > = taskSequence.map((taskId, i) => ({
          planId: "alpha",
          taskId,
          phaseId: `implementation-${i}`,
          isLastPhase: true,
          promptText: `${taskId} prompt ${i}`,
        }));
      prompts.push(null);

      const getNextPhasePrompt = vi
        .fn<ForgePlansClient["getNextPhasePrompt"]>()
        .mockImplementation(async () => prompts.shift() ?? null);
      let threadCounter = 0;
      const startThread = vi
        .fn<ForgePlansClient["startThread"]>()
        .mockImplementation(async () => {
          threadCounter += 1;
          return {
            result: {
              thread: { id: `thread-${caseIndex}-${threadCounter}` },
            },
          };
        });
      const sendUserMessage = vi.fn<ForgePlansClient["sendUserMessage"]>().mockResolvedValue({});

      const plansClient: ForgePlansClient = {
        listPlans: async () => [
          {
            id: "alpha",
            title: "Alpha",
            goal: "Alpha goal",
            tasks: [
              { id: "task-1", name: "Task 1", status: "pending" },
              { id: "task-2", name: "Task 2", status: "pending" },
              { id: "task-3", name: "Task 3", status: "pending" },
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
          collaborationModes={[]}
        />,
      );

      fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
      fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

      const firstUnknown = taskSequence.findIndex((taskId) => !knownTaskSet.has(taskId));
      const executedTaskSequence =
        firstUnknown >= 0 ? taskSequence.slice(0, firstUnknown) : taskSequence;
      const expectedThreadCount = new Set(executedTaskSequence).size;

      await waitFor(() => expect(startThread).toHaveBeenCalledTimes(expectedThreadCount));
      await waitFor(() =>
        expect(sendUserMessage).toHaveBeenCalledTimes(executedTaskSequence.length),
      );

      if (firstUnknown >= 0) {
        await waitFor(() =>
          expect(screen.getByRole("alert").textContent).toContain("unexpected task id"),
        );
      } else {
        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy(),
        );
        expect(screen.queryByRole("alert")).toBeNull();
      }
    }
  });

  it("waits and re-polls after failing phase checks without starting a new session", async () => {
    const startThread = vi
      .fn<ForgePlansClient["startThread"]>()
      .mockResolvedValueOnce({ result: { thread: { id: "thread-1" } } });
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
      .mockResolvedValueOnce(null);
    const runPhaseChecks = vi
      .fn<ForgePlansClient["runPhaseChecks"]>()
      .mockResolvedValueOnce({ ok: false, results: [] });

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
      getNextPhasePrompt,
      getPhaseStatus: async () => ({ status: "completed", commitSha: null }),
      runPhaseChecks,
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
        collaborationModes={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));

    await waitFor(() => expect(runPhaseChecks).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 1300));
    await waitFor(() => expect(getNextPhasePrompt).toHaveBeenCalledTimes(2));
    expect(startThread).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();
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

  it("shows only the active task as running and demotes stale in-progress rows to pending", async () => {
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
            id: "implementation",
            title: "Implementation",
            iconId: "console",
            order: 2,
          },
        ],
        taskPhaseStatusByTaskId: {
          "task-1": {
            "test-case-mapping": "completed",
            implementation: "pending",
          },
          "task-2": {
            "test-case-mapping": "completed",
            implementation: "in_progress",
          },
        },
      });

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            { id: "task-1", name: "Task 1", status: "in_progress" },
            { id: "task-2", name: "Task 2", status: "pending" },
          ],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      loadPhaseView,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-2",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 2 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-2" } } }),
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

    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    expect(await screen.findByText("Phase implementation in progress")).toBeTruthy();

    const staleRow = screen.getByText("Task 1").closest("li") as HTMLLIElement | null;
    const activeRow = screen.getByText("Task 2").closest("li") as HTMLLIElement | null;
    expect(staleRow).toBeTruthy();
    expect(activeRow).toBeTruthy();
    expect(staleRow?.className.includes("pending")).toBe(true);
    expect(staleRow?.className.includes("inProgress")).toBe(false);
    expect(activeRow?.className.includes("inProgress")).toBe(true);

    expect(staleRow?.querySelector(".forge-running-icon.spinning")).toBeNull();
    expect(activeRow?.querySelector(".forge-running-icon.spinning")).toBeTruthy();
    expect(document.querySelectorAll(".forge-running-icon.spinning")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
  });

  it("demotes stale in-progress rows to completed when all phases are completed", async () => {
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
            id: "implementation",
            title: "Implementation",
            iconId: "console",
            order: 2,
          },
        ],
        taskPhaseStatusByTaskId: {
          "task-1": {
            "test-case-mapping": "completed",
            implementation: "completed",
          },
          "task-2": {
            "test-case-mapping": "pending",
            implementation: "in_progress",
          },
        },
      });

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            { id: "task-1", name: "Task 1", status: "in_progress" },
            { id: "task-2", name: "Task 2", status: "pending" },
          ],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      loadPhaseView,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-2",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 2 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-2" } } }),
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

    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    expect(await screen.findByText("Phase implementation in progress")).toBeTruthy();

    const staleRow = screen.getByText("Task 1").closest("li") as HTMLLIElement | null;
    const activeRow = screen.getByText("Task 2").closest("li") as HTMLLIElement | null;
    expect(staleRow).toBeTruthy();
    expect(activeRow).toBeTruthy();
    expect(staleRow?.className.includes("completed")).toBe(true);
    expect(staleRow?.className.includes("inProgress")).toBe(false);
    expect(activeRow?.className.includes("inProgress")).toBe(true);

    expect(staleRow?.querySelector(".forge-running-icon.spinning")).toBeNull();
    expect(activeRow?.querySelector(".forge-running-icon.spinning")).toBeTruthy();
    expect(document.querySelectorAll(".forge-running-icon.spinning")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
  });

  it("preserves single-row running invariants across deterministic phase-status matrices", async () => {
    const phaseIds = ["test-case-mapping", "implementation", "ai-review"] as const;
    const statuses = ["pending", "in_progress", "completed", "failed", "blocked"] as const;
    let seed = 4242;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };

    for (let index = 0; index < 12; index += 1) {
      const phaseStatuses = phaseIds.reduce<Record<string, (typeof statuses)[number]>>(
        (acc, phaseId) => {
          // Randomly omit some phase entries to cover missing-status fallback behavior.
          if (next() % 4 === 0) {
            return acc;
          }
          acc[phaseId] = statuses[next() % statuses.length];
          return acc;
        },
        {},
      );
      const allCompleted = phaseIds.every(
        (phaseId) => phaseStatuses[phaseId] === "completed",
      );
      const expectedStaleStatus = allCompleted ? "completed" : "pending";

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
              id: "implementation",
              title: "Implementation",
              iconId: "console",
              order: 2,
            },
            {
              id: "ai-review",
              title: "AI Review",
              iconId: "folder-review",
              order: 3,
            },
          ],
          taskPhaseStatusByTaskId: {
            "task-1": phaseStatuses,
            "task-2": {
              "test-case-mapping": "completed",
              implementation: "in_progress",
              "ai-review": "pending",
            },
          },
        });

      const plansClient: ForgePlansClient = {
        listPlans: async () => [
          {
            id: `alpha-${index}`,
            title: "Alpha",
            goal: "Alpha goal",
            tasks: [
              { id: "task-1", name: "Task 1", status: "in_progress" },
              { id: "task-2", name: "Task 2", status: "pending" },
            ],
            currentTaskId: null,
            planPath: "plans/alpha/plan.json",
            updatedAtMs: 0,
          },
        ],
        loadPhaseView,
        getPlanPrompt: async () => "",
        prepareExecution: async () => {},
        resetExecutionProgress: async () => {},
        getNextPhasePrompt: async () => ({
          planId: `alpha-${index}`,
          taskId: "task-2",
          phaseId: "implementation",
          isLastPhase: true,
          promptText: "task 2 prompt",
        }),
        getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
        runPhaseChecks: async () => ({ ok: true, results: [] }),
        interruptTurn: async () => ({}),
        connectWorkspace: async () => {},
        startThread: async () => ({ result: { thread: { id: "thread-2" } } }),
        sendUserMessage: async () => ({}),
      };

      const rendered = render(
        <Forge
          activeWorkspaceId="ws-1"
          templatesClient={templatesClient}
          plansClient={plansClient}
          collaborationModes={[]}
        />,
      );

      fireEvent.click(await screen.findByRole("button", { name: /Click to select/i }));
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha-" + index + ")" }));
      await waitFor(() =>
        expect(loadPhaseView).toHaveBeenCalledWith("ws-1", `alpha-${index}`, null),
      );

      fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
      expect(await screen.findByText("Phase implementation in progress")).toBeTruthy();

      const staleRow = screen.getByText("Task 1").closest("li") as HTMLLIElement | null;
      const activeRow = screen.getByText("Task 2").closest("li") as HTMLLIElement | null;
      expect(staleRow).toBeTruthy();
      expect(activeRow).toBeTruthy();
      expect(staleRow?.className.includes(expectedStaleStatus)).toBe(true);
      expect(staleRow?.className.includes("inProgress")).toBe(false);
      expect(activeRow?.className.includes("inProgress")).toBe(true);
      expect(staleRow?.querySelector(".forge-running-icon.spinning")).toBeNull();
      expect(activeRow?.querySelector(".forge-running-icon.spinning")).toBeTruthy();
      expect(document.querySelectorAll(".forge-running-icon.spinning")).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
      rendered.unmount();
    }
  });

  it("does not render a running spinner when runningInfo points to a non-visible task", async () => {
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
            id: "implementation",
            title: "Implementation",
            iconId: "console",
            order: 2,
          },
        ],
        taskPhaseStatusByTaskId: {
          "task-1": {
            "test-case-mapping": "completed",
            implementation: "pending",
          },
          "task-2": {
            "test-case-mapping": "pending",
            implementation: "pending",
          },
        },
      });

    const plansClient: ForgePlansClient = {
      listPlans: async () => [
        {
          id: "alpha",
          title: "Alpha",
          goal: "Alpha goal",
          tasks: [
            { id: "task-1", name: "Task 1", status: "in_progress" },
            { id: "task-2", name: "Task 2", status: "pending" },
          ],
          currentTaskId: null,
          planPath: "plans/alpha/plan.json",
          updatedAtMs: 0,
        },
      ],
      loadPhaseView,
      getPlanPrompt: async () => "",
      prepareExecution: async () => {},
      resetExecutionProgress: async () => {},
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-3",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "task 3 prompt",
      }),
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
      interruptTurn: async () => ({}),
      connectWorkspace: async () => {},
      startThread: async () => ({ result: { thread: { id: "thread-3" } } }),
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

    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("unexpected task id"),
    );
    expect(screen.getByRole("button", { name: "Resume plan" })).toBeTruthy();

    const staleRow = screen.getByText("Task 1").closest("li") as HTMLLIElement | null;
    const secondRow = screen.getByText("Task 2").closest("li") as HTMLLIElement | null;
    expect(staleRow).toBeTruthy();
    expect(secondRow).toBeTruthy();
    expect(staleRow?.className.includes("pending")).toBe(true);
    expect(staleRow?.className.includes("inProgress")).toBe(false);
    expect(secondRow?.className.includes("inProgress")).toBe(false);
    expect(document.querySelectorAll(".forge-running-icon.spinning")).toHaveLength(0);
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

  it("keeps terminal ai-review failures visibly non-completed even after prior phases complete", async () => {
    const loadPhaseView = vi
      .fn<NonNullable<ForgePlansClient["loadPhaseView"]>>()
      .mockResolvedValue({
        phases: [
          { id: "test-case-mapping", title: "Test Case Mapping", iconId: "taskfile", order: 1 },
          { id: "behavioral-tests", title: "Behavioral Tests", iconId: "cucumber", order: 2 },
          { id: "implementation", title: "Implementation", iconId: "console", order: 3 },
          {
            id: "coverage-hardening",
            title: "Coverage Hardening",
            iconId: "codecov",
            order: 4,
          },
          { id: "documentation", title: "Documentation", iconId: "readme", order: 5 },
          { id: "ai-review", title: "AI Review Gate", iconId: "folder-review", order: 6 },
        ],
        taskPhaseStatusByTaskId: {
          "task-1": {
            "test-case-mapping": "completed",
            "behavioral-tests": "completed",
            implementation: "completed",
            "coverage-hardening": "completed",
            documentation: "completed",
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
          tasks: [{ id: "task-1", name: "Task 1", status: "completed" }],
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
    const aiReviewChip = rowElement.querySelector(
      '.forge-phase[data-phase-id="ai-review"]',
    ) as HTMLElement | null;
    const docsChip = rowElement.querySelector(
      '.forge-phase[data-phase-id="documentation"]',
    ) as HTMLElement | null;

    expect(docsChip?.className.includes("is-complete")).toBe(true);
    expect(aiReviewChip?.className.includes("is-pending")).toBe(true);
    expect(aiReviewChip?.className.includes("is-complete")).toBe(false);
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
