/**
 * Approved video embeds.
 *
 * THE RULE: THE SITE BUILDS THE EMBED URL, THE AUTHOR SUPPLIES AN ID.
 *
 * A video block stores a provider from a closed list and an opaque id — never a
 * URL, and never markup. The renderer constructs the iframe source itself from
 * those two values, so there is no path by which an author (or a tampered
 * database row, or a future import) can put an arbitrary origin into an
 * `<iframe src>`. That is what makes "approved embed" mean something: an
 * embedded third-party frame can run script and read its own cookies, so the
 * set of origins it may come from has to be decided here, in code, rather than
 * wherever the content came from.
 *
 * The id pattern is deliberately narrow — the character sets YouTube and Vimeo
 * actually use. Anything else is refused at the schema boundary AND again at
 * render time, because storage is not the only way data arrives in a database.
 *
 * WHY NOT ACCEPT A PASTED URL. It is friendlier, and it is the mistake: a
 * pasted URL has to be parsed, and every parser that has ever been asked to
 * decide "is this a YouTube link?" has eventually said yes to something else.
 * `parseVideoReference` below does accept a pasted URL, but only in the EDITOR,
 * to extract an id which is then validated and stored on its own.
 */

export const VIDEO_PROVIDERS = ['youtube', 'vimeo'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export function isVideoProvider(v: unknown): v is VideoProvider {
  return typeof v === 'string' && (VIDEO_PROVIDERS as readonly string[]).includes(v);
}

/** The id shapes each approved provider uses. */
const VIDEO_ID_PATTERN: Record<VideoProvider, RegExp> = {
  // YouTube ids are 11 characters of an unreserved alphabet.
  youtube: /^[A-Za-z0-9_-]{11}$/,
  // Vimeo ids are numeric.
  vimeo: /^[0-9]{6,12}$/,
};

export function isVideoId(provider: unknown, id: unknown): boolean {
  if (!isVideoProvider(provider) || typeof id !== 'string') return false;
  return VIDEO_ID_PATTERN[provider].test(id);
}

/**
 * The embed URL for a validated reference, or `null`.
 *
 * Returning `null` rather than throwing lets the renderer draw a plain note in
 * place of the frame: a bad reference costs the reader one video, not the page.
 *
 * The YouTube host is the no-cookie one, which does not set tracking cookies
 * until the viewer presses play.
 */
export function videoEmbedUrl(provider: unknown, id: unknown): string | null {
  if (!isVideoId(provider, id)) return null;
  const safeId = encodeURIComponent(id as string);
  switch (provider as VideoProvider) {
    case 'youtube': return `https://www.youtube-nocookie.com/embed/${safeId}`;
    case 'vimeo': return `https://player.vimeo.com/video/${safeId}`;
    default: return null;
  }
}

/** The page a reader would open to watch the video on the provider's own site. */
export function videoWatchUrl(provider: unknown, id: unknown): string | null {
  if (!isVideoId(provider, id)) return null;
  const safeId = encodeURIComponent(id as string);
  switch (provider as VideoProvider) {
    case 'youtube': return `https://www.youtube.com/watch?v=${safeId}`;
    case 'vimeo': return `https://vimeo.com/${safeId}`;
    default: return null;
  }
}

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
};

/**
 * Extracts a provider and id from something an author pasted. EDITOR ONLY.
 *
 * This exists so an author can paste the link they have rather than hunt for an
 * id — but what it returns is validated by `isVideoId` and stored as two
 * separate fields, so the pasted string itself never reaches storage or the
 * rendered page. It is parsed with `URL`, not a regular expression, because
 * host-matching by pattern is how "youtube.com.evil.test" gets accepted.
 */
export function parseVideoReference(
  input: string,
): { provider: VideoProvider; id: string } | null {
  const raw = input.trim();
  if (!raw) return null;

  // A bare id, when the author already has one. YouTube's shape is checked
  // first because an 11-character token is unambiguous; a bare number is
  // ambiguous enough that it is treated as Vimeo only if it fits that shape.
  if (VIDEO_ID_PATTERN.youtube.test(raw) && !/^\d+$/.test(raw)) {
    return { provider: 'youtube', id: raw };
  }
  if (VIDEO_ID_PATTERN.vimeo.test(raw)) return { provider: 'vimeo', id: raw };

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);

  // Host equality, never "contains" or "endsWith" on a bare domain.
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    const candidate = v ?? (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live'
      ? segments[1]
      : undefined);
    return candidate && VIDEO_ID_PATTERN.youtube.test(candidate)
      ? { provider: 'youtube', id: candidate }
      : null;
  }
  if (host === 'youtu.be') {
    const candidate = segments[0];
    return candidate && VIDEO_ID_PATTERN.youtube.test(candidate)
      ? { provider: 'youtube', id: candidate }
      : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // `/video/123456` on the player host, `/123456` on the site.
    const candidate = segments[0] === 'video' ? segments[1] : segments[0];
    return candidate && VIDEO_ID_PATTERN.vimeo.test(candidate)
      ? { provider: 'vimeo', id: candidate }
      : null;
  }
  return null;
}
