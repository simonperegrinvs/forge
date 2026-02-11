// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CollaborationModeOption } from "../../../types";
import { useCollaborationModeSelection } from "./useCollaborationModeSelection";

function makeMode(overrides?: Partial<CollaborationModeOption>): CollaborationModeOption {
  return {
    id: "plan",
    label: "Plan",
    mode: "plan",
    model: "o3",
    reasoningEffort: null,
    developerInstructions: null,
    value: {},
    ...overrides,
  };
}

describe("useCollaborationModeSelection", () => {
  it("uses the mode's model when resolvedModel is null", () => {
    const mode = makeMode({ model: "o3" });
    const { result } = renderHook(() =>
      useCollaborationModeSelection({
        selectedCollaborationMode: mode,
        selectedCollaborationModeId: "plan",
        selectedEffort: null,
        resolvedModel: null,
      }),
    );

    expect(result.current.collaborationModePayload).toEqual({
      mode: "plan",
      settings: { developer_instructions: null, model: "o3" },
    });
  });

  it("prefers resolvedModel when provided", () => {
    const mode = makeMode({ model: "o3" });
    const { result } = renderHook(() =>
      useCollaborationModeSelection({
        selectedCollaborationMode: mode,
        selectedCollaborationModeId: "plan",
        selectedEffort: null,
        resolvedModel: "o4-mini",
      }),
    );

    expect(result.current.collaborationModePayload).toEqual({
      mode: "plan",
      settings: { developer_instructions: null, model: "o4-mini" },
    });
  });

  it("returns null when no model is available", () => {
    const mode = makeMode({ model: "" });
    const { result } = renderHook(() =>
      useCollaborationModeSelection({
        selectedCollaborationMode: mode,
        selectedCollaborationModeId: "plan",
        selectedEffort: null,
        resolvedModel: null,
      }),
    );

    expect(result.current.collaborationModePayload).toBeNull();
  });
});

