import CheckSquare2 from "lucide-react/dist/esm/icons/check-square-2";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Circle from "lucide-react/dist/esm/icons/circle";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import LayoutTemplate from "lucide-react/dist/esm/icons/layout-template";
import Pause from "lucide-react/dist/esm/icons/pause";
import Play from "lucide-react/dist/esm/icons/play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollaborationModeOption, WorkspaceInfo } from "../../../types";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useDismissibleMenu } from "../../app/hooks/useDismissibleMenu";
import {
  forgeGetInstalledTemplate,
  forgeInstallTemplate,
  forgeLoadPhaseView,
  forgeListBundledTemplates,
  forgeUninstallTemplate,
  type ForgeBundledTemplateInfo,
  type ForgeNextPhasePrompt,
  type ForgePhaseViewStatus,
  type ForgePhaseView,
  type ForgePhaseStatus,
  type ForgeRunPhaseChecksResponse,
  type ForgeTemplateLock,
  type ForgeWorkspacePlan,
} from "../../../services/tauri";
import {
  connectWorkspace,
  forgeResetExecutionProgress,
  forgeGetNextPhasePrompt,
  forgeGetPlanPrompt,
  forgeGetPhaseStatus,
  forgeListPlans,
  forgePrepareExecution,
  forgeRunPhaseChecks,
  interruptTurn,
  sendUserMessage,
  startThread,
} from "../../../services/tauri";
import { useForgeExecution } from "../hooks/useForgeExecution";
import { getForgePhaseIconUrl } from "../../../utils/forgePhaseIcons";

export type ForgeTemplatesClient = {
  listBundledTemplates: () => Promise<ForgeBundledTemplateInfo[]>;
  getInstalledTemplate: (workspaceId: string) => Promise<ForgeTemplateLock | null>;
  installTemplate: (workspaceId: string, templateId: string) => Promise<ForgeTemplateLock>;
  uninstallTemplate: (workspaceId: string) => Promise<void>;
};

export type ForgePlansClient = {
  listPlans: (workspaceId: string) => Promise<ForgeWorkspacePlan[]>;
  loadPhaseView?: (
    workspaceId: string,
    planId: string,
    installedTemplateId: string | null,
  ) => Promise<ForgePhaseView>;
  getPlanPrompt: (workspaceId: string) => Promise<string>;
  prepareExecution: (workspaceId: string, planId: string) => Promise<void>;
  resetExecutionProgress: (workspaceId: string, planId: string) => Promise<void>;
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
  connectWorkspace: (workspaceId: string) => Promise<void>;
  startThread: (workspaceId: string) => Promise<any>;
  sendUserMessage: (
    workspaceId: string,
    threadId: string,
    text: string,
    options?: {
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<any>;
};

const defaultForgeTemplatesClient: ForgeTemplatesClient = {
  listBundledTemplates: forgeListBundledTemplates,
  getInstalledTemplate: forgeGetInstalledTemplate,
  installTemplate: forgeInstallTemplate,
  uninstallTemplate: forgeUninstallTemplate,
};

const defaultForgePlansClient: ForgePlansClient = {
  listPlans: forgeListPlans,
  loadPhaseView: forgeLoadPhaseView,
  getPlanPrompt: forgeGetPlanPrompt,
  prepareExecution: forgePrepareExecution,
  resetExecutionProgress: forgeResetExecutionProgress,
  getNextPhasePrompt: forgeGetNextPhasePrompt,
  getPhaseStatus: forgeGetPhaseStatus,
  runPhaseChecks: forgeRunPhaseChecks,
  interruptTurn,
  connectWorkspace,
  startThread,
  sendUserMessage,
};

type ForgeItemStatus = "pending" | "inProgress" | "completed";

type ForgePlanItem = {
  id: string;
  title: string;
  status: ForgeItemStatus;
};

type ForgePlan = {
  id: string;
  name: string;
  items: ForgePlanItem[];
};

const EMPTY_PHASE_VIEW: ForgePhaseView = {
  phases: [],
  taskPhaseStatusByTaskId: {},
};

type ForgePhaseChipState = "is-complete" | "is-current" | "is-pending";
type ForgeRunningInfo = { taskId: string; phaseId: string } | null;

function formatPlanLabel(plan: ForgeWorkspacePlan): string {
  const title = plan.title?.trim() ?? "";
  const goal = plan.goal?.trim() ?? "";
  const id = plan.id?.trim() ?? "";
  if (title && id) {
    return `${title} (${id})`;
  }
  if (title) {
    return title;
  }
  const shortGoal =
    goal.length > 60 ? `${goal.slice(0, 57).trimEnd()}...` : goal;
  if (shortGoal && id) {
    return `${shortGoal} (${id})`;
  }
  return shortGoal || id || "Untitled plan";
}

function mapForgeItemStatus(status: string): ForgeItemStatus {
  const normalized = status.trim().toLowerCase();
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "in_progress") {
    return "inProgress";
  }
  return "pending";
}

function mapForgePhaseChipState(
  taskId: string,
  phaseId: string,
  phaseStatus: ForgePhaseViewStatus,
  runningInfo: ForgeRunningInfo,
): ForgePhaseChipState {
  const normalizedStatus = phaseStatus.trim().toLowerCase();
  if (runningInfo?.taskId === taskId && runningInfo.phaseId === phaseId) {
    return "is-current";
  }
  if (normalizedStatus === "in_progress") {
    return "is-current";
  }
  if (normalizedStatus === "completed") {
    return "is-complete";
  }
  return "is-pending";
}

function allTaskPhasesCompleted(
  taskPhaseStatuses: Record<string, ForgePhaseViewStatus>,
  phases: ForgePhaseView["phases"],
): boolean {
  if (phases.length > 0) {
    return phases.every(
      (phase) =>
        (taskPhaseStatuses[phase.id] ?? "pending").trim().toLowerCase() ===
        "completed",
    );
  }
  const phaseStatuses = Object.values(taskPhaseStatuses);
  return (
    phaseStatuses.length > 0 &&
    phaseStatuses.every((status) => status.trim().toLowerCase() === "completed")
  );
}

function deriveStatusFromTaskPhases(
  taskPhaseStatuses: Record<string, ForgePhaseViewStatus>,
  phases: ForgePhaseView["phases"],
): ForgeItemStatus | null {
  const phaseStatuses = Object.values(taskPhaseStatuses);
  if (phaseStatuses.length === 0) {
    return null;
  }
  if (allTaskPhasesCompleted(taskPhaseStatuses, phases)) {
    return "completed";
  }
  if (phaseStatuses.some((status) => status.trim().toLowerCase() === "in_progress")) {
    return "inProgress";
  }
  return "pending";
}

function resolveForgeTaskRowStatus({
  taskId,
  planTaskStatus,
  taskPhaseStatuses,
  phases,
  runningInfo,
}: {
  taskId: string;
  planTaskStatus: ForgeItemStatus;
  taskPhaseStatuses: Record<string, ForgePhaseViewStatus>;
  phases: ForgePhaseView["phases"];
  runningInfo: ForgeRunningInfo;
}): ForgeItemStatus {
  if (runningInfo?.taskId === taskId) {
    return "inProgress";
  }

  const phaseDerivedStatus = deriveStatusFromTaskPhases(taskPhaseStatuses, phases);
  const resolvedStatus = phaseDerivedStatus ?? planTaskStatus;

  if (runningInfo && resolvedStatus === "inProgress") {
    return allTaskPhasesCompleted(taskPhaseStatuses, phases)
      ? "completed"
      : "pending";
  }

  return resolvedStatus;
}

function ForgeTemplatesModal({
  templates,
  installedTemplate,
  canManage,
  onInstallTemplate,
  onUninstallTemplate,
  onClose,
}: {
  templates: ForgeBundledTemplateInfo[];
  installedTemplate: ForgeTemplateLock | null;
  canManage: boolean;
  onInstallTemplate: (templateId: string) => void;
  onUninstallTemplate: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const installed = installedTemplate
    ? templates.find((t) => t.id === installedTemplate.installedTemplateId) ?? {
        id: installedTemplate.installedTemplateId,
        title: installedTemplate.installedTemplateId,
        version: installedTemplate.installedTemplateVersion,
      }
    : null;
  const others = installed
    ? templates.filter((t) => t.id !== installed.id)
    : templates;

  return (
    <ModalShell
      className="forge-templates-modal"
      onBackdropClick={onClose}
      ariaLabel="Forge templates"
    >
      <div className="ds-modal-title forge-templates-title">Templates</div>
      <div className="ds-modal-subtitle forge-templates-subtitle">
        Choose a template to install or swap. Behaviors are stubbed for now.
      </div>
      <div className="ds-modal-divider" />
      <div className="forge-templates-list" role="list">
        {installed ? (
          <div className="forge-template-row" role="listitem">
            <div className="forge-template-main">
              <div className="forge-template-name">{installed.title}</div>
              <div className="forge-template-meta">
                Installed{installed.version ? ` (${installed.version})` : ""}
              </div>
            </div>
            <div className="forge-template-actions">
              <button
                type="button"
                className="ghost forge-template-icon"
                aria-label="Edit template"
                title="Edit template"
                onClick={() => {
                  // TODO(Forge): wire template edit
                }}
              >
                <Pencil aria-hidden />
              </button>
              <button
                type="button"
                className="ghost forge-template-action"
                onClick={() => {
                  onUninstallTemplate();
                  onClose();
                }}
                disabled={!canManage}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="forge-template-empty">No template installed.</div>
        )}

        {others.map((template) => {
          const actionLabel = installed ? "Swap" : "Install";
          return (
            <div key={template.id} className="forge-template-row" role="listitem">
              <div className="forge-template-main">
                <div className="forge-template-name">{template.title}</div>
              </div>
              <div className="forge-template-actions">
                <button
                  type="button"
                  className="ghost forge-template-action"
                  onClick={() => {
                    onInstallTemplate(template.id);
                    onClose();
                  }}
                  disabled={!canManage}
                >
                  {actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ds-modal-actions forge-templates-actions">
        <button type="button" className="ghost ds-modal-button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

export function Forge({
  activeWorkspaceId,
  activeWorkspace = null,
  sendUserMessageToThread,
  templatesClient,
  plansClient,
  onSelectThread,
  collaborationModes = [],
  onSelectCollaborationMode,
}: {
  activeWorkspaceId: string | null;
  activeWorkspace?: WorkspaceInfo | null;
  sendUserMessageToThread?: (
    workspace: WorkspaceInfo,
    threadId: string,
    message: string,
    imageIds: string[],
    options?: {
      collaborationMode?: Record<string, unknown> | null;
    },
  ) => Promise<void>;
  templatesClient?: ForgeTemplatesClient;
  plansClient?: ForgePlansClient;
  onSelectThread?: (workspaceId: string, threadId: string) => void;
  collaborationModes?: CollaborationModeOption[];
  onSelectCollaborationMode?: (id: string | null) => void;
}) {
  const client = templatesClient ?? defaultForgeTemplatesClient;
  const plansApi = plansClient ?? defaultForgePlansClient;
  const listBundledTemplates = client.listBundledTemplates;
  const getInstalledTemplate = client.getInstalledTemplate;
  const installTemplate = client.installTemplate;
  const uninstallTemplate = client.uninstallTemplate;
  const listPlans = plansApi.listPlans;
  const loadPhaseView = plansApi.loadPhaseView ?? forgeLoadPhaseView;
  const getPlanPrompt = plansApi.getPlanPrompt;
  const prepareExecution = plansApi.prepareExecution;
  const resetExecutionProgress = plansApi.resetExecutionProgress;
  const getNextPhasePrompt = plansApi.getNextPhasePrompt;
  const getPhaseStatus = plansApi.getPhaseStatus;
  const runPhaseChecks = plansApi.runPhaseChecks;
  const interruptPlanTurn = plansApi.interruptTurn;
  const connectWorkspaceToRun = plansApi.connectWorkspace;
  const startThreadForPlan = plansApi.startThread;
  const sendUserMessageToPlanThread = plansApi.sendUserMessage;
  const hasActiveWorkspace = Boolean(activeWorkspaceId?.trim());

  const findCollaborationMode = useCallback(
    (wanted: string) => {
      const normalized = wanted.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      return (
        collaborationModes.find(
          (mode) => mode.id.trim().toLowerCase() === normalized,
        ) ??
        collaborationModes.find(
          (mode) => (mode.mode || mode.id).trim().toLowerCase() === normalized,
        ) ??
        null
      );
    },
    [collaborationModes],
  );

  const buildCollaborationModePayloadFor = useCallback(
    (mode: CollaborationModeOption | null) => {
      if (!mode) {
        return null;
      }
      const modeValue = mode.mode || mode.id;
      if (!modeValue) {
        return null;
      }
      const modelValue = (mode.model ?? "").trim();
      if (!modelValue) {
        // CollaborationMode.settings.model is required by the app-server protocol.
        // If we can't supply a model, don't send an override payload.
        return null;
      }
      const settings: Record<string, unknown> = {
        developer_instructions: mode.developerInstructions ?? null,
        model: modelValue,
      };
      if (mode.reasoningEffort !== null) {
        settings.reasoning_effort = mode.reasoningEffort;
      }
      return { mode: modeValue, settings };
    },
    [],
  );

  const [templates, setTemplates] = useState<ForgeBundledTemplateInfo[]>([]);
  const [installedTemplate, setInstalledTemplate] = useState<ForgeTemplateLock | null>(null);
  const [workspacePlans, setWorkspacePlans] = useState<ForgeWorkspacePlan[]>([]);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const plansInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void listBundledTemplates()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setTemplates(items);
      })
      .catch((error) => {
        console.warn("Failed to load Forge templates.", { error });
      });
    return () => {
      cancelled = true;
    };
  }, [listBundledTemplates]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId) {
      setInstalledTemplate(null);
      setWorkspacePlans([]);
      return () => {
        cancelled = true;
      };
    }
    void getInstalledTemplate(activeWorkspaceId)
      .then((installed) => {
        if (cancelled) {
          return;
        }
        setInstalledTemplate(installed);
      })
      .catch((error) => {
        console.warn("Failed to load installed Forge template.", { error });
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, getInstalledTemplate]);

  const refreshPlans = useCallback(
    async (workspaceId: string) => {
      if (plansInFlightRef.current) {
        return;
      }
      plansInFlightRef.current = true;
      try {
        const next = await listPlans(workspaceId);
        setWorkspacePlans(next);
      } catch (error) {
        console.warn("Failed to load Forge plans.", { error });
      } finally {
        plansInFlightRef.current = false;
      }
    },
    [listPlans],
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId) {
      setWorkspacePlans([]);
      return () => {
        cancelled = true;
      };
    }

    const loadPlans = async () => {
      if (cancelled) {
        return;
      }
      await refreshPlans(activeWorkspaceId);
    };

    void loadPlans();
    const interval = window.setInterval(loadPlans, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeWorkspaceId, refreshPlans]);

  const plans: ForgePlan[] = useMemo(() => {
    return workspacePlans.map((plan) => {
      const items: ForgePlanItem[] = plan.tasks.map((task) => {
        const status = mapForgeItemStatus(task.status);
        return {
          id: task.id,
          title: task.name,
          status,
        };
      });

      return {
        id: plan.id,
        name: formatPlanLabel(plan),
        items,
      };
    });
  }, [workspacePlans]);

  const handleInstallTemplate = useCallback(
    (templateId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      void installTemplate(activeWorkspaceId, templateId)
        .then((lock) => {
          setInstalledTemplate(lock);
        })
        .catch((error) => {
          console.warn("Failed to install Forge template.", { error });
        });
    },
    [activeWorkspaceId, installTemplate],
  );

  const handleUninstallTemplate = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    void uninstallTemplate(activeWorkspaceId)
      .then(() => {
        setInstalledTemplate(null);
      })
      .catch((error) => {
        console.warn("Failed to uninstall Forge template.", { error });
      });
  }, [activeWorkspaceId, uninstallTemplate]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const selectedPlan = selectedPlanId
    ? plans.find((p) => p.id === selectedPlanId) ?? null
    : null;
  const [phaseView, setPhaseView] = useState<ForgePhaseView>(EMPTY_PHASE_VIEW);

  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const planMenuRef = useRef<HTMLDivElement | null>(null);

  const [templatesOpen, setTemplatesOpen] = useState(false);

  useDismissibleMenu({
    isOpen: planMenuOpen,
    containerRef: planMenuRef,
    onClose: () => setPlanMenuOpen(false),
  });

  useEffect(() => {
    if (hasActiveWorkspace) {
      return;
    }
    setPlanMenuOpen(false);
  }, [hasActiveWorkspace]);

  useEffect(() => {
    if (!selectedPlanId) {
      return;
    }
    if (!plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(null);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId || !selectedPlanId) {
      setPhaseView(EMPTY_PHASE_VIEW);
      return () => {
        cancelled = true;
      };
    }

    const installedTemplateId = installedTemplate?.installedTemplateId ?? null;
    const refreshPhaseView = async () => {
      try {
        const next = await loadPhaseView(
          activeWorkspaceId,
          selectedPlanId,
          installedTemplateId,
        );
        if (cancelled) {
          return;
        }
        setPhaseView(next);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.warn("Failed to load Forge phase view.", { error });
        setPhaseView(EMPTY_PHASE_VIEW);
      }
    };

    void refreshPhaseView();
    const interval = window.setInterval(refreshPhaseView, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeWorkspaceId,
    installedTemplate?.installedTemplateId,
    loadPhaseView,
    selectedPlanId,
  ]);

  const executionMode = useMemo(() => {
    const mode =
      findCollaborationMode("default") ??
      findCollaborationMode("code") ??
      collaborationModes[0] ??
      null;
    return buildCollaborationModePayloadFor(mode);
  }, [buildCollaborationModePayloadFor, collaborationModes, findCollaborationMode]);
  const selectedPlanTaskIds = useMemo(
    () => selectedPlan?.items.map((item) => item.id) ?? null,
    [selectedPlan],
  );

  const {
    isExecuting,
    runningInfo,
    lastError,
    startExecution,
    pauseExecution,
  } = useForgeExecution({
    workspaceId: activeWorkspaceId,
    knownTaskIds: selectedPlanTaskIds,
    connectWorkspace: connectWorkspaceToRun,
    prepareExecution,
    getNextPhasePrompt,
    getPhaseStatus,
    runPhaseChecks,
    interruptTurn: interruptPlanTurn,
    startThread: startThreadForPlan,
    sendUserMessage: sendUserMessageToPlanThread,
    onSelectThread,
    collaborationMode: executionMode,
  });

  useEffect(() => {
    // Avoid executing the wrong plan if the user switches selection mid-run.
    void pauseExecution();
  }, [pauseExecution, selectedPlanId]);

  const handleNewPlan = useCallback(async () => {
    if (!activeWorkspaceId) {
      return;
    }

    setPlanMenuOpen(false);

    // Start in plan collaboration mode so the UI shows the structured plan turn item.
    // Writing plan files is handled after planning (outside plan mode).
    const planMode = findCollaborationMode("plan");
    if (planMode?.id) {
      onSelectCollaborationMode?.(planMode.id);
    }
    const collaborationMode = buildCollaborationModePayloadFor(planMode);

    try {
      await connectWorkspaceToRun(activeWorkspaceId);

      const response = await startThreadForPlan(activeWorkspaceId);
      const thread =
        (response?.result?.thread ?? response?.thread ?? null) as
          | Record<string, unknown>
          | null;
      const threadId = String(thread?.id ?? "").trim();
      if (!threadId) {
        console.warn("Forge new plan: missing thread id.", { response });
        return;
      }

      onSelectThread?.(activeWorkspaceId, threadId);

      const prompt = await getPlanPrompt(activeWorkspaceId);
      if (!prompt.trim()) {
        console.warn("Forge new plan: plan prompt is empty.");
        return;
      }

      if (sendUserMessageToThread && activeWorkspace?.id === activeWorkspaceId) {
        await sendUserMessageToThread(activeWorkspace, threadId, prompt, [], {
          collaborationMode,
        });
      } else {
        await sendUserMessageToPlanThread(activeWorkspaceId, threadId, prompt, {
          collaborationMode,
        });
      }
    } catch (error) {
      console.warn("Forge new plan: failed to start plan thread.", { error });
    }
  }, [
    activeWorkspaceId,
    activeWorkspace,
    buildCollaborationModePayloadFor,
    connectWorkspaceToRun,
    findCollaborationMode,
    getPlanPrompt,
    onSelectCollaborationMode,
    onSelectThread,
    sendUserMessageToPlanThread,
    sendUserMessageToThread,
    startThreadForPlan,
  ]);

  const handleCleanProgress = useCallback(async () => {
    const workspaceId = activeWorkspaceId?.trim();
    const planId = selectedPlanId?.trim();
    if (!workspaceId || !planId || isResettingProgress) {
      return;
    }

    const confirmed = window.confirm(
      "Clean progress will reset this plan's state and derived execution files. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setIsResettingProgress(true);
    try {
      if (isExecuting) {
        await pauseExecution();
      }
      await resetExecutionProgress(workspaceId, planId);
      await refreshPlans(workspaceId);
    } catch (error) {
      console.warn("Forge clean progress failed.", { error });
    } finally {
      setIsResettingProgress(false);
    }
  }, [
    activeWorkspaceId,
    isExecuting,
    isResettingProgress,
    pauseExecution,
    refreshPlans,
    resetExecutionProgress,
    selectedPlanId,
  ]);

  return (
    <div className="forge-panel" data-testid="forge-panel">
      <div className="forge-header">
        <div className="forge-title">Forge</div>
      </div>

      <section className="forge-card" aria-label="Plan selection">
        <div className="forge-card-header">
          <div className="forge-card-title">Plan</div>
        </div>
        <div className="forge-plan-select" ref={planMenuRef}>
          <button
            type="button"
            className="ghost forge-template-toggle"
            aria-label="Open templates"
            title="Templates"
            data-tauri-drag-region="false"
            onClick={() => setTemplatesOpen(true)}
            disabled={!hasActiveWorkspace}
          >
            <LayoutTemplate aria-hidden />
          </button>
          <button
            type="button"
            className={`ghost forge-plan-toggle${planMenuOpen ? " is-open" : ""}`}
            data-tauri-drag-region="false"
            onClick={() => {
              if (!hasActiveWorkspace) {
                return;
              }
              setPlanMenuOpen((open) => !open);
            }}
            aria-haspopup="menu"
            aria-expanded={planMenuOpen}
            disabled={!hasActiveWorkspace}
          >
            <span className={selectedPlan ? "forge-plan-name" : "forge-plan-empty"}>
              {selectedPlan ? selectedPlan.name : "Click to select"}
            </span>
            <ChevronDown aria-hidden />
          </button>

          {planMenuOpen && (
            <PopoverSurface className="forge-plan-menu" role="menu">
              {plans.map((plan) => (
                <PopoverMenuItem
                  key={plan.id}
                  role="menuitemradio"
                  aria-checked={selectedPlanId === plan.id}
                  active={selectedPlanId === plan.id}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setPlanMenuOpen(false);
                  }}
                  data-tauri-drag-region="false"
                >
                  {plan.name}
                </PopoverMenuItem>
              ))}
              <div className="forge-plan-menu-divider" aria-hidden />
              <PopoverMenuItem
                onClick={() => {
                  // TODO(Forge): wire file selection dialog
                  setPlanMenuOpen(false);
                }}
                data-tauri-drag-region="false"
              >
                Other...
              </PopoverMenuItem>
              <PopoverMenuItem
                onClick={handleNewPlan}
                data-tauri-drag-region="false"
              >
                New plan...
              </PopoverMenuItem>
            </PopoverSurface>
          )}
        </div>
      </section>

      <section className="forge-card" aria-label="Plan execution">
        <div className="forge-card-header">
          <div className="forge-card-header-left">
            <div className="forge-card-title">Execution</div>
            <div className="forge-card-subtitle">
              {selectedPlan
                ? runningInfo
                  ? `${selectedPlan.name} • ${runningInfo.taskId}/${runningInfo.phaseId}`
                  : selectedPlan.name
                : "No plan selected"}
            </div>
          </div>
          <div className="forge-card-header-actions">
            <button
              type="button"
              className="ghost forge-execute-toggle"
              data-tauri-drag-region="false"
              disabled={!hasActiveWorkspace || !selectedPlan}
              aria-label={isExecuting ? "Pause plan" : "Resume plan"}
              aria-pressed={isExecuting}
              title={
                !hasActiveWorkspace
                  ? "Select a project to use Forge"
                  : !selectedPlan
                  ? "Select a plan to run"
                  : isExecuting
                    ? "Pause plan"
                    : "Resume plan"
              }
              onClick={() => {
                if (!hasActiveWorkspace || !selectedPlan) {
                  return;
                }
                if (isExecuting) {
                  void pauseExecution();
                  return;
                }
                void startExecution(selectedPlan.id);
              }}
            >
              {isExecuting ? <Pause aria-hidden /> : <Play aria-hidden />}
            </button>
            <button
              type="button"
              className="ghost forge-reset-progress"
              data-tauri-drag-region="false"
              disabled={!hasActiveWorkspace || !selectedPlan || isResettingProgress}
              aria-label="Clean progress"
              title={
                !hasActiveWorkspace
                  ? "Select a project to use Forge"
                  : !selectedPlan
                  ? "Select a plan to clean progress"
                  : "Reset state and derived execution files"
              }
              onClick={() => {
                void handleCleanProgress();
              }}
            >
              {isResettingProgress ? "Resetting..." : "Clean progress"}
            </button>
          </div>
        </div>
        <div className="forge-execution">
          {lastError ? (
            <div className="forge-execution-error" role="alert">
              {lastError}
            </div>
          ) : null}
          {!hasActiveWorkspace ? (
            <div className="forge-empty">
              Select a project first to use Forge.
            </div>
          ) : selectedPlan ? (
            <ol className="forge-items">
              {selectedPlan.items.map((item, index) => {
                const isActiveTask = runningInfo?.taskId === item.id;
                const taskPhaseStatuses = phaseView.taskPhaseStatusByTaskId[item.id] ?? {};
                const effectiveStatus = resolveForgeTaskRowStatus({
                  taskId: item.id,
                  planTaskStatus: item.status,
                  taskPhaseStatuses,
                  phases: phaseView.phases,
                  runningInfo,
                });
                const isCompleted = effectiveStatus === "completed";
                const isRunning = effectiveStatus === "inProgress";
                const isActivePhase = isActiveTask && runningInfo?.phaseId;

                return (
                  <li key={`${item.id}-${item.title}-${index}`} className={`forge-item ${effectiveStatus}`}>
                    <div className="forge-item-row">
                      <span className="forge-item-icon" aria-hidden>
                        {isCompleted ? (
                          <CheckSquare2 aria-hidden />
                        ) : isRunning ? (
                          <RefreshCw className="forge-running-icon spinning" aria-hidden />
                        ) : (
                          <Circle aria-hidden />
                        )}
                      </span>
                      <span className="forge-item-title">{item.title}</span>
                      {isActivePhase ? (
                        <span className="forge-item-meta">
                          Phase {runningInfo.phaseId} in progress
                        </span>
                      ) : null}
                    </div>
                    {phaseView.phases.length > 0 ? (
                      <div className="forge-phases">
                        {phaseView.phases.map((phase) => {
                          const chipState = mapForgePhaseChipState(
                            item.id,
                            phase.id,
                            taskPhaseStatuses[phase.id] ?? "pending",
                            runningInfo,
                          );
                          const iconUrl = getForgePhaseIconUrl(phase.iconId);
                          return (
                            <span
                              key={`${item.id}-${phase.id}`}
                              className={`forge-phase ${chipState}`}
                              data-phase-id={phase.id}
                            >
                              <span className="forge-phase-icon" aria-hidden>
                                <img src={iconUrl} alt="" aria-hidden />
                              </span>
                              <span className="forge-phase-name">{phase.title}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="forge-empty">
              Select a plan to see execution progress.
            </div>
          )}
        </div>
      </section>

      {templatesOpen && (
        <ForgeTemplatesModal
          templates={templates}
          installedTemplate={installedTemplate}
          canManage={Boolean(activeWorkspaceId)}
          onInstallTemplate={handleInstallTemplate}
          onUninstallTemplate={handleUninstallTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </div>
  );
}
