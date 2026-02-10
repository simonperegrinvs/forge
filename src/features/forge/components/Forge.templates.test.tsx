// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Forge, type ForgeTemplatesClient } from "./Forge";

afterEach(() => {
  cleanup();
});

describe("Forge templates", () => {
  it("renders bundled templates and disables install when no workspace is active", async () => {
    const calls = {
      getInstalled: [] as string[],
      install: [] as Array<{ workspaceId: string; templateId: string }>,
      uninstall: [] as string[],
    };

    const templatesClient: ForgeTemplatesClient = {
      listBundledTemplates: async () => [
        { id: "ralph-loop", title: "Ralph Loop", version: "0.1.0" },
      ],
      getInstalledTemplate: async (workspaceId) => {
        calls.getInstalled.push(workspaceId);
        return null;
      },
      installTemplate: async (workspaceId, templateId) => {
        calls.install.push({ workspaceId, templateId });
        return {
          schema: "forge-template-lock-v1",
          installedTemplateId: templateId,
          installedTemplateVersion: "0.1.0",
          installedAtIso: "2026-02-10T00:00:00Z",
          installedFiles: ["template.json"],
        };
      },
      uninstallTemplate: async (workspaceId) => {
        calls.uninstall.push(workspaceId);
      },
    };

    render(<Forge activeWorkspaceId={null} templatesClient={templatesClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    expect(screen.getByText("Templates")).toBeTruthy();

    // Wait for the bundled templates to load.
    await screen.findByText("Ralph Loop");

    expect(screen.getByText("No template installed.")).toBeTruthy();

    const installButton = screen.getByRole("button", { name: "Install" });
    expect(installButton.hasAttribute("disabled")).toBe(true);
    expect(calls.getInstalled).toEqual([]);
  });

  it("shows an installed template even when it is missing from the bundled list", async () => {
    const templatesClient: ForgeTemplatesClient = {
      listBundledTemplates: async () => [],
      getInstalledTemplate: async () => ({
        schema: "forge-template-lock-v1",
        installedTemplateId: "unknown-template",
        installedTemplateVersion: "9.9.9",
        installedAtIso: "2026-02-10T00:00:00Z",
        installedFiles: ["template.json"],
      }),
      installTemplate: async () => {
        throw new Error("unexpected install");
      },
      uninstallTemplate: async () => {
        throw new Error("unexpected uninstall");
      },
    };

    render(<Forge activeWorkspaceId="ws-1" templatesClient={templatesClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    await screen.findByText("unknown-template");
    expect(screen.getByText(/Installed \(9\.9\.9\)/)).toBeTruthy();
  });

  it("installs and uninstalls a template when a workspace is active", async () => {
    const calls = {
      install: [] as Array<{ workspaceId: string; templateId: string }>,
      uninstall: [] as string[],
    };

    let installed: { id: string; version: string } | null = null;

    const templatesClient: ForgeTemplatesClient = {
      listBundledTemplates: async () => [
        { id: "ralph-loop", title: "Ralph Loop", version: "0.1.0" },
      ],
      getInstalledTemplate: async () => {
        if (!installed) {
          return null;
        }
        return {
          schema: "forge-template-lock-v1",
          installedTemplateId: installed.id,
          installedTemplateVersion: installed.version,
          installedAtIso: "2026-02-10T00:00:00Z",
          installedFiles: ["template.json"],
        };
      },
      installTemplate: async (workspaceId, templateId) => {
        calls.install.push({ workspaceId, templateId });
        installed = { id: templateId, version: "0.1.0" };
        return {
          schema: "forge-template-lock-v1",
          installedTemplateId: templateId,
          installedTemplateVersion: "0.1.0",
          installedAtIso: "2026-02-10T00:00:00Z",
          installedFiles: ["template.json"],
        };
      },
      uninstallTemplate: async (workspaceId) => {
        calls.uninstall.push(workspaceId);
        installed = null;
      },
    };

    render(<Forge activeWorkspaceId="ws-1" templatesClient={templatesClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    await screen.findByText("Ralph Loop");

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(calls.install).toEqual([{ workspaceId: "ws-1", templateId: "ralph-loop" }]);
    });

    // Reopen modal and ensure it shows as installed.
    fireEvent.click(screen.getByRole("button", { name: "Open templates" }));
    await screen.findByText("Ralph Loop");

    const removeButton = screen.getByRole("button", { name: "Remove" });
    expect(removeButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(removeButton);
    await waitFor(() => {
      expect(calls.uninstall).toEqual(["ws-1"]);
    });
  });
});
