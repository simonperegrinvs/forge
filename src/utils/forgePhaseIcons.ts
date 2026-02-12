import {
  getIconUrlByName,
  isMaterialIconName,
  type MaterialIcon,
} from "vscode-material-icons";

const MATERIAL_ICONS_BASE_URL = "/assets/material-icons";
const DEFAULT_FORGE_PHASE_ICON_ID: MaterialIcon = "file";
const forgePhaseIconUrlCache = new Map<string, string>();

function resolveForgePhaseIconId(iconId: string | null | undefined): MaterialIcon {
  const normalized = typeof iconId === "string" ? iconId.trim() : "";
  if (normalized && isMaterialIconName(normalized)) {
    return normalized;
  }
  return DEFAULT_FORGE_PHASE_ICON_ID;
}

export function getForgePhaseIconUrl(iconId: string | null | undefined): string {
  const resolvedIconId = resolveForgePhaseIconId(iconId);
  const cached = forgePhaseIconUrlCache.get(resolvedIconId);
  if (cached) {
    return cached;
  }

  const iconUrl = getIconUrlByName(resolvedIconId, MATERIAL_ICONS_BASE_URL);
  forgePhaseIconUrlCache.set(resolvedIconId, iconUrl);
  return iconUrl;
}
