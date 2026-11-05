'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { submitCommentAction } from '../../app/(public)/account/actions';

interface Comment { id: string; author: string; body: string; createdAt: string }
const MAX = 2000;

/**
 * Article comments (Batch 24). Approved comments are server-rendered (passed in);
 * the form + auth state hydrate on the client (via /api/account/me) so the article
 * page stays ISR. Bodies render as escaped React text — no raw HTML/scripts/embeds.
 */
export const CommentSection: React.FC<{ articleId: string; initialComments: Comment[] }> = ({ articleId, initialComments }) => {
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    fetch('/api/account/me/', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (alive) setLoggedIn(!!d.user); }).catch(() => { if (alive) setLoggedIn(false); });
    return () => { alive = false; };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const r = await submitCommentAction(articleId, text);
      if (r.ok) { setStatus({ kind: 'ok', msg: 'Thanks! Your comment is awaiting moderation and will appear once approved.' }); setBody(''); }
      else setStatus({ kind: 'error', msg: r.error });
    });
  };

  return (
    <section aria-labelledby="comments-heading" className="max-w-[720px] mx-auto px-4 sm:px-6 py-12 border-t border-stone-200">
      <h2 id="comments-heading" className="font-serif text-2xl font-bold text-[#0F1115] mb-6">
        Comments <span className="text-ink-muted text-lg">({initialComments.length})</span>
      </h2>

      {initialComments.length === 0 ? (
        <p className="text-sm text-ink-muted mb-8">No comments yet. Be the first to share your thoughts.</p>
      ) : (
        <ul className="space-y-5 mb-10">
          {initialComments.map((c) => (
            <li key={c.id} className="border-b border-stone-100 pb-5">
              <div className="flex items-center gap-2 text-xs text-ink-muted mb-1">
                <span className="font-semibold text-stone-800">{c.author}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={c.createdAt}>{new Date(c.createdAt).toISOString().slice(0, 10)}</time>
              </div>
              {/* Escaped React text — never raw HTML. */}
              <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Composer */}
      {loggedIn === undefined ? null : loggedIn ? (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="comment-body" className="block text-[11px] font-mono uppercase tracking-wider text-ink-muted">Add a comment</label>
          <textarea
            id="comment-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX} rows={4}
            placeholder="Share your thoughts…"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-ink-muted">{body.length}/{MAX} · comments are reviewed before they appear</span>
            <button type="submit" disabled={pending || !body.trim()} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-800 disabled:opacity-50">
              {pending ? 'Posting…' : 'Post comment'}
            </button>
          </div>
          {status.kind === 'ok' && <p role="status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xs px-3 py-2">{status.msg}</p>}
          {status.kind === 'error' && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xs px-3 py-2">{status.msg}</p>}
        </form>
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-5 text-center">
          <p className="text-sm text-stone-600"><Link href="/login/" className="text-[#8B5E3C] underline font-semibold">Sign in</Link> or <Link href="/register/" className="text-[#8B5E3C] underline font-semibold">create an account</Link> to join the conversation.</p>
        </div>
      )}
    </section>
  );
};

export default CommentSection;
