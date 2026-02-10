function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderTemplate(templateText, values) {
  let output = templateText;
  for (const [key, rawValue] of Object.entries(values)) {
    const value = rawValue == null ? "" : String(rawValue);
    const pattern = new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, "g");
    output = output.replace(pattern, value);
  }
  return output;
}

export function formatBulletList(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return "";
  }
  return list.map((item) => `- ${item}`).join("\n");
}

