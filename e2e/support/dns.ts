import dns from "node:dns";

import { target } from "./targets";

/**
 * Opt-in (`E2E_DNS=1.1.1.1`): resolve the target hosts through a public
 * resolver instead of the machine's. Useful right after a DNS cutover, when a
 * local caching resolver (e.g. Tailscale MagicDNS) still answers with the old
 * records. Applies to Node requests and, via host-resolver rules, to Chrome.
 */
const siteHost = new URL(target.site).hostname;
const hosts = [
  siteHost,
  `www.${siteHost}`,
  `docs.${siteHost}`,
  new URL(target.app).hostname,
  new URL(target.api).hostname,
];

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void;

export const resolveTargetHosts = async (server: string) => {
  const resolver = new dns.promises.Resolver();
  resolver.setServers([server]);
  const table = new Map<string, string>();
  for (const host of hosts) {
    const [address] = await resolver.resolve4(host).catch((): string[] => []);
    if (address) {
      table.set(host, address);
    }
  }

  const original = dns.lookup;
  const patched = (
    hostname: string,
    options: dns.LookupOptions,
    callback: LookupCallback
  ) => {
    const address = table.get(hostname);
    if (!address) {
      return original(hostname, options, callback);
    }
    return options.all
      ? callback(null, [{ address, family: 4 }])
      : callback(null, address, 4);
  };
  Object.assign(dns, { lookup: patched });

  const originalPromise = dns.promises.lookup;
  const patchedPromise = (
    hostname: string,
    options: dns.LookupOptions = {}
  ) => {
    const address = table.get(hostname);
    if (!address) {
      return originalPromise(hostname, options);
    }
    if (options.family === 6) {
      return options.all
        ? Promise.resolve([])
        : Promise.reject(
            Object.assign(new Error("no AAAA"), { code: "ENOTFOUND" })
          );
    }
    return Promise.resolve(
      options.all ? [{ address, family: 4 }] : { address, family: 4 }
    );
  };
  Object.assign(dns.promises, { lookup: patchedPromise });

  return [...table]
    .map(([host, address]) => `MAP ${host} ${address}`)
    .join(", ");
};
