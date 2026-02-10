import { useMemo } from "react";
import type { CollaborationModeOption } from "../../../types";

type UseCollaborationModeSelectionOptions = {
  selectedCollaborationMode: CollaborationModeOption | null;
  selectedCollaborationModeId: string | null;
  selectedEffort: string | null;
  resolvedModel: string | null;
};

export function useCollaborationModeSelection({
  selectedCollaborationMode,
  selectedCollaborationModeId,
  selectedEffort,
  resolvedModel,
}: UseCollaborationModeSelectionOptions) {
  const collaborationModePayload = useMemo(() => {
    if (!selectedCollaborationModeId || !selectedCollaborationMode) {
      return null;
    }

    const modeValue = selectedCollaborationMode.mode || selectedCollaborationMode.id;
    if (!modeValue) {
      return null;
    }

    const modelValue = (resolvedModel ?? selectedCollaborationMode.model ?? "").trim();
    if (!modelValue) {
      // CollaborationMode.settings.model is required by the app-server protocol.
      // If we can't supply it, skip setting a collaborationMode override.
      return null;
    }

    const settings: Record<string, unknown> = {
      developer_instructions: selectedCollaborationMode.developerInstructions ?? null,
      model: modelValue,
    };

    if (selectedEffort !== null) {
      settings.reasoning_effort = selectedEffort;
    }

    return {
      mode: modeValue,
      settings,
    };
  }, [
    resolvedModel,
    selectedCollaborationMode,
    selectedCollaborationModeId,
    selectedEffort,
  ]);

  return { collaborationModePayload };
}
