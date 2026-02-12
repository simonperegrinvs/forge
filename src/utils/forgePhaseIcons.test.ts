import { describe, expect, it } from "vitest";
import { getForgePhaseIconUrl } from "./forgePhaseIcons";

describe("forgePhaseIcons", () => {
  it("resolves valid material icon ids to the expected asset url", () => {
    expect(getForgePhaseIconUrl("cucumber")).toBe("/assets/material-icons/cucumber.svg");
  });

  it("falls back to the safe default icon when the id is invalid", () => {
    expect(getForgePhaseIconUrl("definitely-not-a-real-material-icon")).toBe(
      "/assets/material-icons/file.svg",
    );
  });

  it("accepts valid icon ids with surrounding whitespace", () => {
    expect(getForgePhaseIconUrl("  taskfile  ")).toBe("/assets/material-icons/taskfile.svg");
  });
});
