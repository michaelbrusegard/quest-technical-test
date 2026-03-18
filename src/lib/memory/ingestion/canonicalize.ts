import type { StandardHistoryVisit } from '@/lib/browser-history';
import type { MemorySettings, StoredVisit } from '@/lib/memory/domain/types';

const IGNORED_QUERY_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'src',
  'utm_campaign',
  'utm_content',
  'utm_id',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

const BLOCKED_PROTOCOLS = [
  'about:',
  'chrome:',
  'edge:',
  'file:',
  'moz-extension:',
  'safari-extension:',
];

export function normalizeVisit(
  visit: StandardHistoryVisit,
  settings: MemorySettings,
  importedAtMs: number,
): StoredVisit | null {
  if (!isVisitAllowed(visit, settings)) {
    return null;
  }

  return {
    ...visit,
    canonicalUrl: canonicalizeUrl(visit.url),
    importedAtMs,
  };
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = '';
    for (const key of Array.from(parsedUrl.searchParams.keys())) {
      if (IGNORED_QUERY_PARAMETERS.has(key.toLowerCase())) {
        parsedUrl.searchParams.delete(key);
      }
    }

    const normalizedPath = parsedUrl.pathname.replace(/\/$/, '') || '/';
    parsedUrl.pathname = normalizedPath;
    parsedUrl.host = parsedUrl.host.toLowerCase();
    parsedUrl.protocol = parsedUrl.protocol.toLowerCase();

    const canonicalUrl = parsedUrl.toString();
    return canonicalUrl.endsWith('/') && normalizedPath === '/'
      ? canonicalUrl.slice(0, -1)
      : canonicalUrl;
  } catch {
    return url.trim();
  }
}

export function isVisitAllowed(visit: StandardHistoryVisit, settings: MemorySettings): boolean {
  const lowerUrl = visit.url.toLowerCase();
  if (BLOCKED_PROTOCOLS.some((protocol) => lowerUrl.startsWith(protocol))) {
    return false;
  }

  const normalizedDomain = visit.domain?.toLowerCase() ?? extractDomainFromUrl(visit.url);
  if (!normalizedDomain) {
    return false;
  }

  return !settings.excludedDomains.some((domain) => {
    const normalizedExcludedDomain = domain.trim().toLowerCase();
    return (
      normalizedExcludedDomain.length > 0 && normalizedDomain.endsWith(normalizedExcludedDomain)
    );
  });
}

function extractDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
