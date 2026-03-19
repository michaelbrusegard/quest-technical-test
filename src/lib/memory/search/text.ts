const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'anything',
  'are',
  'about',
  'did',
  'for',
  'from',
  'have',
  'how',
  'i',
  'in',
  'into',
  'is',
  'it',
  'lately',
  'last',
  'me',
  'my',
  'of',
  'on',
  'or',
  'recent',
  'recently',
  'something',
  'stuff',
  'that',
  'the',
  'things',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'with',
  'yesterday',
]);

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[_#]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function tokenizeText(value: string, options?: { keepStopWords?: boolean }): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[^a-z0-9.\-/]+/)
    .flatMap((token) => splitCompositeToken(token))
    .filter((token) => token.length >= 2)
    .filter((token) => options?.keepStopWords || !STOP_WORDS.has(token));
}

export function buildSearchText(parts: Array<string | null | undefined>): string {
  const normalizedParts = parts.map((part) => part?.trim()).filter(Boolean) as string[];
  const tokens = uniqueStrings(normalizedParts.flatMap((part) => tokenizeText(part)));

  return [...normalizedParts, tokens.join(' ')].filter(Boolean).join('\n');
}

export function expandQueryTerms(rawQuery: string): string[] {
  const tokens = tokenizeText(rawQuery);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    if (token === 'nixos' || token === 'nix') {
      expanded.add('nixos');
      expanded.add('nix');
      expanded.add('flakes');
      expanded.add('flake');
      expanded.add('home');
      expanded.add('manager');
      expanded.add('configuration');
      expanded.add('config');
      expanded.add('dotfiles');
    }

    if (token === 'github') {
      expanded.add('git');
      expanded.add('pull');
      expanded.add('repo');
      expanded.add('repository');
    }

    if (token === 'watch' || token === 'watched' || token === 'video') {
      expanded.add('watch');
      expanded.add('watched');
      expanded.add('video');
      expanded.add('youtube');
      expanded.add('vimeo');
      expanded.add('player');
    }

    if (token === 'read' || token === 'docs') {
      expanded.add('docs');
      expanded.add('documentation');
      expanded.add('guide');
      expanded.add('reference');
    }
  }

  return [...expanded];
}

export function extractUrlTerms(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostTokens = splitCompositeToken(parsed.hostname.replace(/^www\./, ''));
    const pathTokens = parsed.pathname
      .split('/')
      .flatMap((segment) => splitCompositeToken(segment));
    const queryTokens = [...parsed.searchParams.keys(), ...parsed.searchParams.values()].flatMap(
      (segment) => splitCompositeToken(segment),
    );

    return uniqueStrings([...hostTokens, ...pathTokens, ...queryTokens]);
  } catch {
    return tokenizeText(url);
  }
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function splitCompositeToken(token: string): string[] {
  return token
    .split(/[.\-/]+/)
    .flatMap((part) => part.split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/))
    .map((part) => part.trim())
    .filter(Boolean);
}
