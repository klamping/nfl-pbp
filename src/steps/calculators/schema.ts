import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'stats-schema.json');

let allowedStatsCache: Set<string> | null = null;
let groupsCache: Record<string, string[]> | null = null;

export function loadAllowedStats(): Set<string> | null {
  if (allowedStatsCache !== null) return allowedStatsCache;
  const groups = loadSchemaGroups();
  if (!groups) {
    allowedStatsCache = null;
    return null;
  }
  allowedStatsCache = new Set(Object.values(groups).flat());
  return allowedStatsCache;
}

export function loadSchemaGroups(): Record<string, string[]> | null {
  if (groupsCache !== null) return groupsCache;
  if (!fs.existsSync(SCHEMA_PATH)) {
    groupsCache = null;
    return null;
  }
  try {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8')) as any;
    const groups = schema?.groups ?? {};
    const out: Record<string, string[]> = {};
    Object.entries(groups).forEach(([groupName, groupValue]: [string, any]) => {
      const stats = Object.keys(groupValue?.stats ?? {});
      out[groupName] = stats;
    });
    groupsCache = out;
    return out;
  } catch (err) {
    console.warn(`Failed to parse stats schema at ${SCHEMA_PATH}: ${(err as Error).message}`);
    groupsCache = null;
    return null;
  }
}

