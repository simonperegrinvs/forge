export function parseFlagValue(argv, flagName) {
  const exact = `--${flagName}`;
  const prefix = `--${flagName}=`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === exact) {
      return argv[i + 1] ?? null;
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return null;
}

export function requireFlagValue(argv, flagName) {
  const value = parseFlagValue(argv, flagName);
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required flag: --${flagName} <path>`);
  }
  return value;
}

