/**
 * Turns the last Playwright run (test-results/results.json) into a
 * secret-free artifact: e2e/reports/<date>-<target>/report.md plus the
 * screenshots and traces it references. Only report.md is committed; the
 * rest is gitignored. Traces are unzipped, scrubbed and re-zipped so API
 * keys, session cookies, tokens and passwords are redacted before anything
 * is shared.
 *
 *   pnpm e2e:report
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

interface Attachment {
  readonly name: string;
  readonly contentType: string;
  readonly path?: string;
  readonly body?: string;
}
interface TestResult {
  readonly status: string;
  readonly duration: number;
  readonly errors: readonly { readonly message?: string }[];
  readonly attachments: readonly Attachment[];
}
interface Spec {
  readonly title: string;
  readonly file: string;
  readonly tests: readonly { readonly results: readonly TestResult[] }[];
}
interface Suite {
  readonly title: string;
  readonly specs?: readonly Spec[];
  readonly suites?: readonly Suite[];
}
interface Results {
  readonly suites: readonly Suite[];
  readonly stats: { readonly startTime: string; readonly duration: number };
}

const TEXT_EXTENSIONS =
  /\.(?:json|jsonl|trace|network|stacks|txt|html|js|css|md)$/u;
const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [/emitkit_[A-Za-z0-9]{8,64}/gu, "emitkit_[REDACTED]"],
  [
    /(?<keep>"name":\s*"(?:authorization|cookie|set-cookie|x-api-key)",\s*"value":\s*")[^"]*"/giu,
    '$<keep>[REDACTED]"',
  ],
  [
    /(?<keep>(?:emitkit|__Secure-emitkit)\.[a-z_]+=)[^;"\s\\]+/giu,
    "$<keep>[REDACTED]",
  ],
  [
    /(?<keep>"(?:token|secret|password|session_token|p256dh|auth)"\s*:\s*")[^"]*"/giu,
    '$<keep>[REDACTED]"',
  ],
  [/(?<keep>token=)[A-Za-z0-9_-]{16,}/gu, "$<keep>[REDACTED]"],
  // Parsew publishable keys ride in brand-icon image URLs.
  [/pk_[A-Za-z0-9_-]+/gu, "pk_[REDACTED]"],
  [/e2e-Correct-Horse-9/gu, "[REDACTED-PASSWORD]"],
  // Billing (14-billing): Autumn keys, webhook secrets and signatures, and
  // Stripe checkout / billing portal sessions (bearer links while they live).
  [/am_sk_[A-Za-z0-9_]+/gu, "am_sk_[REDACTED]"],
  [/whsec_[A-Za-z0-9+/=]+/gu, "whsec_[REDACTED]"],
  [
    /(?<keep>"name":\s*"svix-signature",\s*"value":\s*")[^"]*"/giu,
    '$<keep>[REDACTED]"',
  ],
  [/cs_(?:test|live)_[A-Za-z0-9]+(?:#[^"'\s]*)?/gu, "cs_[REDACTED]"],
  [/(?<keep>[?&]secret=)[A-Za-z0-9_-]+/gu, "$<keep>[REDACTED]"],
];

const redactText = (text: string) => {
  let value = text;
  for (const [pattern, replacement] of REDACTIONS) {
    value = value.replace(pattern, replacement);
  }
  return value;
};

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    return statSync(entryPath).isDirectory() ? walk(entryPath) : [entryPath];
  });

const redactTrace = (source: string, destination: string) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "emitkit-trace-"));
  execFileSync("unzip", ["-q", source, "-d", scratch]);
  for (const file of walk(scratch)) {
    const isText =
      TEXT_EXTENSIONS.test(file) ||
      !/\.(?:png|jpe?g|webp|gif|woff2?|ico)$/u.test(file);
    if (isText) {
      const content = readFileSync(file);
      if (!content.includes(0)) {
        writeFileSync(file, redactText(content.toString("utf-8")));
      }
    }
  }
  execFileSync("zip", ["-qr", destination, "."], { cwd: scratch });
  rmSync(scratch, { force: true, recursive: true });
};

const collect = (suite: Suite): Spec[] => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(collect),
];

const slug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 80);

const results: Results = JSON.parse(
  readFileSync("test-results/results.json", "utf-8")
);
const targetName = process.env.E2E_TARGET ?? "local";
/** A run against a deployment without a marketing site gets its own report. */
const noSite = process.env.E2E_NO_SITE === "1";
const runName = noSite ? `${targetName}-no-site` : targetName;
const date = results.stats.startTime.slice(0, 10);
const directory = path.join("e2e", "reports", `${date}-${runName}`);
rmSync(directory, { force: true, recursive: true });
mkdirSync(path.join(directory, "screenshots"), { recursive: true });
mkdirSync(path.join(directory, "traces"), { recursive: true });
mkdirSync(path.join(directory, "logs"), { recursive: true });

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"])
  .toString()
  .trim();
const specs = results.suites.flatMap(collect);
const rows: string[] = [];
const failures: string[] = [];
let passed = 0;
let failed = 0;
let skipped = 0;

for (const spec of specs) {
  for (const test of spec.tests) {
    const result = test.results.at(-1);
    if (!result) {
      continue;
    }
    const id = slug(`${path.basename(spec.file, ".spec.ts")}-${spec.title}`);
    const links: string[] = [];
    for (const attachment of result.attachments) {
      // `http-log`, and any other JSON a scenario attaches as evidence.
      if (attachment.body && attachment.contentType === "application/json") {
        const http = attachment.name === "http-log";
        const file = http
          ? `logs/${id}.json`
          : `logs/${id}-${slug(attachment.name)}.json`;
        writeFileSync(
          path.join(directory, file),
          redactText(Buffer.from(attachment.body, "base64").toString("utf-8"))
        );
        links.push(
          `[${http ? "http log" : attachment.name.replaceAll("-", " ")}](${file})`
        );
        continue;
      }
      if (!(attachment.path && existsSync(attachment.path))) {
        continue;
      }
      if (attachment.contentType.startsWith("image/")) {
        const file = `screenshots/${id}-${path.basename(attachment.path)}`;
        cpSync(attachment.path, path.join(directory, file));
        links.push(`[screenshot](${file})`);
      } else if (attachment.name === "trace") {
        const file = `traces/${id}.zip`;
        redactTrace(attachment.path, path.join(process.cwd(), directory, file));
        links.push(`[trace](${file})`);
      }
    }
    if (result.status === "passed") {
      passed += 1;
    } else if (result.status === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
      failures.push(
        `### ${spec.file} › ${spec.title}\n\n\`\`\`\n${redactText(result.errors.map((error) => error.message ?? "").join("\n")).slice(0, 2000)}\n\`\`\``
      );
    }
    const icon =
      { failed: "❌", passed: "✅", skipped: "⏭️", timedOut: "⏱️" }[
        result.status
      ] ?? result.status;
    rows.push(
      `| ${icon} | \`${path.basename(spec.file)}\` | ${spec.title} | ${(result.duration / 1000).toFixed(1)}s | ${links.join(" · ")} |`
    );
  }
}

const runEnv = `${noSite ? "E2E_NO_SITE=1 " : ""}E2E_TARGET=${targetName}`;
const server =
  noSite && targetName === "local"
    ? " against `EMITKIT_SITE=off pnpm dev`"
    : "";

const report = `# EmitKit E2E report — ${runName}, ${date}

- Target: **${targetName}**${noSite ? " (no marketing site)" : ""}
- Commit: \`${commit}\`
- Started: ${results.stats.startTime} · duration ${(results.stats.duration / 1000).toFixed(0)}s
- Result: **${passed} passed, ${failed} failed, ${skipped} skipped**

Reproduce: \`${runEnv} pnpm e2e && ${runEnv} pnpm e2e:report\`${server} (see e2e/README.md).
Open a trace with \`pnpm exec playwright show-trace <file>\`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by \`[REDACTED]\`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
${failures.length > 0 ? `\n## Failures\n\n${failures.join("\n\n")}\n` : ""}`;

writeFileSync(path.join(directory, "report.md"), report);
process.stdout.write(
  `wrote ${path.join(directory, "report.md")} (${passed} passed, ${failed} failed, ${skipped} skipped)\n`
);
