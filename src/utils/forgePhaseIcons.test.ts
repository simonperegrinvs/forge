import { describe, expect, it } from "vitest";
import { getForgePhaseIconUrl } from "./forgePhaseIcons";

describe("forgePhaseIcons", () => {
  it("resolves valid material icon ids to material icon asset URLs", () => {
    expect(getForgePhaseIconUrl("codecov")).toBe("/assets/material-icons/codecov.svg");
  });

  it("falls back to the safe default icon URL for invalid icon ids", () => {
    expect(getForgePhaseIconUrl("not-a-material-icon")).toBe(
      "/assets/material-icons/file.svg",
    );
  });
});
