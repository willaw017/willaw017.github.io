const TOP_LEVEL = new Set([
  "schemaVersion",
  "meta",
  "today",
  "questions",
  "chart",
  "timeline",
  "profileStatus"
]);

const TOPICS = ["career", "relationships", "money", "support"];
const CHARTS = ["overview", "career", "money", "relationships"];

export function validateSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("summary must be an object");
  }
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL.has(key)) throw new TypeError(`unexpected top-level key: ${key}`);
  }
  for (const key of TOP_LEVEL) {
    if (!(key in value)) throw new TypeError(`missing top-level key: ${key}`);
  }
  if (value.schemaVersion !== 1) throw new TypeError("unsupported schema version");
  if (value.meta?.realtimeCalculation !== false) {
    throw new TypeError("static release cannot claim realtime calculation");
  }
  if (!value.today?.solarDate || !Array.isArray(value.timeline)) {
    throw new TypeError("summary content is incomplete");
  }
  if (!TOPICS.every((key) => value.questions?.[key])) {
    throw new TypeError("question topics are incomplete");
  }
  if (!CHARTS.every((key) => value.chart?.[key])) {
    throw new TypeError("chart topics are incomplete");
  }
  return value;
}

export async function loadSummary(url = "./data/profile-summary.json") {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`summary request failed: ${response.status}`);
  return validateSummary(await response.json());
}
