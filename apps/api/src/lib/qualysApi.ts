import { XMLParser } from "fast-xml-parser";

// Shared Qualys HTTP + XML primitives. Extracted so qualysSync (detections) and qualysKb
// (KnowledgeBase) can both use them without importing each other — a cycle that happens to work
// under ESM but would break the moment either file touched the other's exports at module scope.

export const QUALYS_BASE = () => process.env.QUALYS_API_URL || "https://qualysapi.qualys.com";

export function qualysConfigured(): boolean {
  return Boolean(process.env.QUALYS_USERNAME && process.env.QUALYS_PASSWORD);
}

export const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep everything as strings; we coerce explicitly
  // Single-element lists collapse to a bare object unless named here. HOST/DETECTION/ID/ID_RANGE
  // are the detection endpoint's; VULN/CVE are the KnowledgeBase's — without them, a one-QID
  // lookup or a single-CVE vuln parses to the wrong shape and only fails for some inputs.
  isArray: (name) =>
    name === "HOST" || name === "DETECTION" || name === "ID" || name === "ID_RANGE" || name === "VULN" || name === "CVE",
});

export async function qualysGet(url: string): Promise<string> {
  const auth = Buffer.from(`${process.env.QUALYS_USERNAME}:${process.env.QUALYS_PASSWORD}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      // Qualys rejects API requests without this header (session-hijack protection).
      "X-Requested-With": "watchtower-sync",
    },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) {
    // Qualys errors come back as SIMPLE_RETURN XML — surface the human-readable TEXT when
    // present (e.g. "Registration must be completed...") instead of a raw XML blob.
    const text = /<TEXT>([\s\S]*?)<\/TEXT>/.exec(body)?.[1]?.trim();
    throw new Error(`Qualys API ${res.status}: ${text ?? body.slice(0, 200)}`);
  }
  return body;
}

/** Safety cap on truncation-following. 50 pages × 1000 hosts is far beyond any single client. */
export const MAX_PAGES = 50;
