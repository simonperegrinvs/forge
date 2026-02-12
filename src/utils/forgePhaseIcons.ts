import {
  getIconUrlByName,
  isMaterialIconName,
  type MaterialIcon,
} from "vscode-material-icons";

const MATERIAL_ICONS_BASE_URL = "/assets/material-icons";
const DEFAULT_FORGE_PHASE_ICON_ID: MaterialIcon = "file";
const forgePhaseIconUrlCache = new Map<string, string>();

function resolveForgePhaseIconId(iconId: string): MaterialIcon {
  const normalized = iconId.trim();
  if (isMaterialIconName(normalized)) {
    return normalized;
  }
  return DEFAULT_FORGE_PHASE_ICON_ID;
}

export function getForgePhaseIconUrl(iconId: string): string {
  const resolvedIconId = resolveForgePhaseIconId(iconId);
  const cached = forgePhaseIconUrlCache.get(resolvedIconId);
  if (cached) {
    return cached;
  }

  const iconUrl = getIconUrlByName(resolvedIconId, MATERIAL_ICONS_BASE_URL);
  forgePhaseIconUrlCache.set(resolvedIconId, iconUrl);
  return iconUrl;
}
