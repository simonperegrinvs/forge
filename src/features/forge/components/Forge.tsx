import CheckSquare2 from "lucide-react/dist/esm/icons/check-square-2";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Circle from "lucide-react/dist/esm/icons/circle";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import LayoutTemplate from "lucide-react/dist/esm/icons/layout-template";
import Pause from "lucide-react/dist/esm/icons/pause";
import Play from "lucide-react/dist/esm/icons/play";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { MaterialSymbol } from "../../design-system/components/icons/MaterialSymbol";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useDismissibleMenu } from "../../app/hooks/useDismissibleMenu";

type ForgePhase = {
  name: string;
  iconName: string;
};

type ForgeItemStatus = "pending" | "inProgress" | "completed";

type ForgePlanItem = {
  title: string;
  status: ForgeItemStatus;
  // If set, we render the full phase row with this as the current phase.
  currentPhaseIndex?: number;
};

type ForgePlan = {
  id: string;
  name: string;
  phases: ForgePhase[];
  items: ForgePlanItem[];
};

type ForgeTemplate = {
  id: string;
  name: string;
};

function PhaseRow({
  phases,
  currentPhaseIndex,
}: {
  phases: ForgePhase[];
  currentPhaseIndex: number;
}) {
  return (
    <div className="forge-phases" aria-label="Phase progress">
      {phases.map((phase, index) => {
        const className =
          index < currentPhaseIndex
            ? "forge-phase is-complete"
            : index === currentPhaseIndex
              ? "forge-phase is-current"
              : "forge-phase is-pending";
        return (
          <span key={`${phase.name}-${index}`} className={className}>
            <span className="forge-phase-icon" aria-hidden>
              <MaterialSymbol name={phase.iconName} size={14} ariaHidden />
            </span>
            <span className="forge-phase-name">
              {index === currentPhaseIndex ? phase.name : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ForgeTemplatesModal({
  templates,
  installedTemplateId,
  onClose,
}: {
  templates: ForgeTemplate[];
  installedTemplateId: string | null;
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

  const installed = installedTemplateId
    ? templates.find((t) => t.id === installedTemplateId) ?? null
    : null;
  const others = templates.filter((t) => t.id !== installedTemplateId);

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
              <div className="forge-template-name">{installed.name}</div>
              <div className="forge-template-meta">Installed</div>
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
                  // TODO(Forge): wire template remove
                }}
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
                <div className="forge-template-name">{template.name}</div>
              </div>
              <div className="forge-template-actions">
                <button
                  type="button"
                  className="ghost forge-template-action"
                  onClick={() => {
                    // TODO(Forge): wire template install/swap
                  }}
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

export function Forge() {
  const plans: ForgePlan[] = useMemo(
    () => [
      {
        id: "plan-alpha",
        name: "Plan Alpha",
        phases: [
          { name: "Phase 1", iconName: "looks_one" },
          { name: "Phase 2", iconName: "looks_two" },
          { name: "Phase 3", iconName: "looks_3" },
          { name: "Phase 4", iconName: "looks_4" },
          { name: "Phase 5", iconName: "looks_5" },
        ],
        items: [
          { title: "Item 1", status: "completed" },
          { title: "Item 2", status: "inProgress", currentPhaseIndex: 2 },
          { title: "Item 3", status: "pending" },
          { title: "Item 4", status: "pending" },
        ],
      },
      {
        id: "plan-beta",
        name: "Plan Beta",
        phases: [
          { name: "Research", iconName: "search" },
          { name: "Build", iconName: "build" },
          { name: "Ship", iconName: "rocket_launch" },
        ],
        items: [
          { title: "Scope", status: "completed" },
          { title: "Implement", status: "inProgress", currentPhaseIndex: 1 },
          { title: "Validate", status: "pending" },
        ],
      },
      {
        id: "plan-gamma",
        name: "Plan Gamma",
        phases: [
          { name: "Phase 1", iconName: "check_circle" },
          { name: "Phase 2", iconName: "check_circle" },
        ],
        items: [
          { title: "Item 1", status: "pending" },
          { title: "Item 2", status: "pending" },
        ],
      },
    ],
    [],
  );

  const templates: ForgeTemplate[] = useMemo(
    () => [
      { id: "tpl-default", name: "Default" },
      { id: "tpl-react", name: "React feature slice" },
      { id: "tpl-rust", name: "Rust core + adapters" },
    ],
    [],
  );

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const selectedPlan = selectedPlanId
    ? plans.find((p) => p.id === selectedPlanId) ?? null
    : null;

  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const planMenuRef = useRef<HTMLDivElement | null>(null);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const installedTemplateId = "tpl-default";
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
                onClick={() => {
                  // TODO(Forge): wire new plan action
                  setPlanMenuOpen(false);
                }}
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
                const showPhases =
                  !isCompleted &&
                  item.currentPhaseIndex != null &&
                  item.currentPhaseIndex >= 0;
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
                    {showPhases && selectedPlan.phases.length > 0 && (
                      <PhaseRow
                        phases={selectedPlan.phases}
                        currentPhaseIndex={item.currentPhaseIndex!}
                      />
                    )}
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
          installedTemplateId={installedTemplateId}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </div>
  );
}
