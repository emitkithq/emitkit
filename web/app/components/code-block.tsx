import { useCopy } from "@app/lib/use-copy";
import { Icon } from "@ui/icon";

/**
 * A dark terminal panel holding a request meant to be copied and run as-is.
 */
export const CodeBlock = ({
  code,
  copyLabel = "Copy curl",
  label = "terminal",
}: {
  code: string;
  copyLabel?: string;
  label?: string;
}) => {
  const { copied, copy } = useCopy();
  return (
    <div className="border-border bg-eclipse text-snow overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-meta font-mono text-white/55">{label}</span>
        <button
          className="text-meta flex items-center gap-1.5 rounded-md px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          onClick={() => copy("code", code)}
          type="button"
        >
          <Icon name={copied === "code" ? "check" : "copy"} size={13} />
          {copied === "code" ? "Copied" : copyLabel}
        </button>
      </div>
      <pre className="text-meta overflow-x-auto p-4 text-left font-mono leading-6 text-white/85">
        <code>{code}</code>
      </pre>
    </div>
  );
};
