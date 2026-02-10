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
  forgeListBundledTemplates,
  forgeUninstallTemplate,
  type ForgeBundledTemplateInfo,
  type ForgeTemplateLock,
  type ForgeWorkspacePlan,
} from "../../../services/tauri";
import {
  connectWorkspace,
  forgeGetPlanPrompt,
  forgeListPlans,
  sendUserMessage,
  startThread,
} from "../../../services/tauri";

export type ForgeTemplatesClient = {
  listBundledTemplates: () => Promise<ForgeBundledTemplateInfo[]>;
  getInstalledTemplate: (workspaceId: string) => Promise<ForgeTemplateLock | null>;
  installTemplate: (workspaceId: string, templateId: string) => Promise<ForgeTemplateLock>;
  uninstallTemplate: (workspaceId: string) => Promise<void>;
};

export type ForgePlansClient = {
  listPlans: (workspaceId: string) => Promise<ForgeWorkspacePlan[]>;
  getPlanPrompt: (workspaceId: string) => Promise<string>;
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
  getPlanPrompt: forgeGetPlanPrompt,
  connectWorkspace,
  startThread,
  sendUserMessage,
};

type ForgeItemStatus = "pending" | "inProgress" | "completed";

type ForgePlanItem = {
  title: string;
  status: ForgeItemStatus;
};

type ForgePlan = {
  id: string;
  name: string;
  items: ForgePlanItem[];
};

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
  const getPlanPrompt = plansApi.getPlanPrompt;
  const connectWorkspaceToRun = plansApi.connectWorkspace;
  const startThreadForPlan = plansApi.startThread;
  const sendUserMessageToPlanThread = plansApi.sendUserMessage;

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

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId) {
      setWorkspacePlans([]);
      return () => {
        cancelled = true;
      };
    }

    const loadPlans = async () => {
      if (plansInFlightRef.current) {
        return;
      }
      plansInFlightRef.current = true;
      try {
        const next = await listPlans(activeWorkspaceId);
        if (cancelled) {
          return;
        }
        setWorkspacePlans(next);
      } catch (error) {
        console.warn("Failed to load Forge plans.", { error });
      } finally {
        plansInFlightRef.current = false;
      }
    };

    void loadPlans();
    const interval = window.setInterval(loadPlans, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeWorkspaceId, listPlans]);

  const plans: ForgePlan[] = useMemo(() => {
    return workspacePlans.map((plan) => {
      const items: ForgePlanItem[] = plan.tasks.map((task) => {
        const status = mapForgeItemStatus(task.status);
        return {
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

  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const planMenuRef = useRef<HTMLDivElement | null>(null);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  useDismissibleMenu({
    isOpen: planMenuOpen,
    containerRef: planMenuRef,
    onClose: () => setPlanMenuOpen(false),
  });

  useEffect(() => {
    // Keep the execute/pause UI from “sticking” when the user switches plans.
    setIsExecuting(false);
  }, [selectedPlanId]);

  useEffect(() => {
    if (!selectedPlanId) {
      return;
    }
    if (!plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(null);
    }
  }, [plans, selectedPlanId]);

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
          >
            <LayoutTemplate aria-hidden />
          </button>
          <button
            type="button"
            className={`ghost forge-plan-toggle${planMenuOpen ? " is-open" : ""}`}
            data-tauri-drag-region="false"
            onClick={() => setPlanMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={planMenuOpen}
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
              {selectedPlan ? selectedPlan.name : "No plan selected"}
            </div>
          </div>
          <div className="forge-card-header-actions">
            <button
              type="button"
              className="ghost forge-execute-toggle"
              data-tauri-drag-region="false"
              disabled={!selectedPlan}
              aria-label={isExecuting ? "Pause plan" : "Run plan"}
              aria-pressed={isExecuting}
              title={
                !selectedPlan
                  ? "Select a plan to run"
                  : isExecuting
                    ? "Pause plan"
                    : "Run plan"
              }
              onClick={() => {
                if (!selectedPlan) {
                  return;
                }
                // TODO(Forge): wire real plan execution and pausing.
                setIsExecuting((prev) => !prev);
              }}
            >
              {isExecuting ? <Pause aria-hidden /> : <Play aria-hidden />}
            </button>
          </div>
        </div>
        <div className="forge-execution">
          {selectedPlan ? (
            <ol className="forge-items">
              {selectedPlan.items.map((item, index) => {
                const isCompleted = item.status === "completed";
                const isRunning = item.status === "inProgress";

                return (
                  <li key={`${item.title}-${index}`} className={`forge-item ${item.status}`}>
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
                    </div>
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
