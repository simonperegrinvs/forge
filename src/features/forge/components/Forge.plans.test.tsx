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
      getNextPhasePrompt: async () => ({
        planId: "alpha",
        taskId: "task-1",
        phaseId: "implementation",
        isLastPhase: true,
        promptText: "execute prompt",
      }),
      getPhaseStatus: async () => ({ status: "completed", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
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

    const runButton = await screen.findByRole("button", { name: "Run plan" });
    expect(runButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Click to select/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha (alpha)" }));

    expect(screen.getByRole("button", { name: "Run plan" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Run plan" }));
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
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
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
      getNextPhasePrompt: async () => null,
      getPhaseStatus: async () => ({ status: "pending", commitSha: null }),
      runPhaseChecks: async () => ({ ok: true, results: [] }),
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
});
