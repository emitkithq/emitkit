/**
 * Facts and destinations the marketing site links to. Kept in one module so
 * copy, head tags and structured data never drift apart.
 */
export const SITE_ORIGIN = "https://emitkit.com";
export const DEFAULT_APP_ORIGIN = "https://app.emitkit.com";
export const API_ORIGIN = "https://api.emitkit.com";
export const EVENTS_ENDPOINT = `${API_ORIGIN}/v1/events`;
export const MCP_ENDPOINT = `${API_ORIGIN}/mcp`;

/** The docs (docs/) are served by the same Worker under /docs. */
export const DOCS_URL = "/docs";
export const QUICKSTART_URL = `${DOCS_URL}/getting-started`;
export const API_REFERENCE_URL = `${DOCS_URL}/reference`;
export const SDK_DOCS_URL = `${DOCS_URL}/sdk`;
export const GITHUB_URL = "https://github.com/emitkithq";
/** The source, for the header's and the pricing section's GitHub buttons. */
export const REPO_URL = "https://github.com/emitkithq/emitkit";

export const CONTACT_EMAIL = "hi@emitkit.com";
export const OPERATOR_NAME = "Chris Jayden";
/** The legal entity behind EmitKit, for the Terms and Privacy Policy. */
export const OPERATOR_LEGAL =
  "Chris Jayden, a sole proprietorship (eenmanszaak) registered in the Netherlands, trading as EmitKit";
export const OPERATOR_ADDRESS =
  "Nijverheidstraat 11 E, 7511 JM Enschede, Netherlands";
export const EVENT_RETENTION_DAYS = 90;
export const RATE_LIMIT_PER_MINUTE = 100;
export const LEGAL_LAST_UPDATED = "September 26, 2026";
export const OPERATOR_KVK = "64594769";
export const OPERATOR_VAT_ID = "NL001103789B33";
