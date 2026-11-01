import React from 'react';

/**
 * Editor-authored landing-page introduction (Batch 11). Plain text rendered as
 * paragraphs — no raw HTML (the service rejects angle brackets). Renders nothing when
 * empty, so pages without an intro are unchanged.
 */
export function EntityIntro({ intro }: { intro: string | null | undefined }) {
  if (!intro || !intro.trim()) return null;
  return (
    <div className="mt-4 text-stone-700 font-sans leading-relaxed space-y-3">
      {intro.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
    </div>
  );
}

export default EntityIntro;
