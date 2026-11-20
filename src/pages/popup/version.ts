/** Chrome release versions contain up to four numeric components. */
export function isNewerVersion(candidate: unknown, installed: string): boolean {
  const parse = (value: unknown) =>
    typeof value === 'string' && /^\d+(?:\.\d+){0,3}$/.test(value) ? value.split('.').map(Number) : null;
  const next = parse(candidate);
  const current = parse(installed);
  if (!next || !current) return false;
  for (let i = 0; i < Math.max(next.length, current.length); i++) {
    const difference = (next[i] || 0) - (current[i] || 0);
    if (difference) return difference > 0;
  }
  return false;
}
