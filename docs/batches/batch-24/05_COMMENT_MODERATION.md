# 05 — Comment Lifecycle & Moderation

## Service layer — `lib/cms/commentService.ts`

All functions are audited and, where privileged, gated by `requireActor(permission)`.

| Function | Who | Behavior |
|---|---|---|
| `createComment(userId, articleId, rawBody)` | authenticated reader/staff | Verifies the user is `ACTIVE` and the article is **PUBLISHED**; enforces anti-spam rate limit `comment:<userId>` (**5 / 5 min**, fail-closed); trims and length-caps at `COMMENT_MAX_LEN = 2000`; inserts as **PENDING**; audits. Unknown article ⇒ `not_found`. |
| `listApprovedForArticle(articleId)` | public | Returns **APPROVED only**, exposing author **display name** and body — **never email**. |
| `listMyComments(userId)` | owner | The reader's own comments across statuses (so they see "pending"). |
| `countApproved(articleId)` | public | Count for the heading. |
| `listForModeration(actor, {status, q})` | `comment.view` | Moderation queue with optional status filter + text search. |
| `moderationCounts(actor)` | `comment.view` | Tab counts per status. |
| `moderateComment(actor, id, status, reason?)` | `comment.moderate` | Sets status + moderation trail. **A moderator cannot approve their own comment** (`forbidden`). |
| `deleteComment(actor, id)` | `comment.delete` (admin) | Hard delete; audited. |

## Public rendering — `components/editorial/CommentSection.tsx`

- Client island on the article page. Approved comments are **server-rendered**
  (passed in as `initialComments`) so the article stays statically generated;
  only auth state + the composer hydrate (via `/api/account/me`).
- Bodies render as `{c.body}` — escaped React text, `whitespace-pre-wrap break-words`.
- Logged-out visitors see a "Sign in / create an account to join the conversation"
  prompt instead of the form.
- On submit, `submitCommentAction` posts and shows "awaiting moderation".

## Admin moderation UI

- Route `app/admin/(dashboard)/comments/page.tsx` → guard on `comment.view`.
- View `views/admin/AdminCommentsPage.tsx` — status tabs with counts, and
  Approve / Reject / Hide / Delete actions (delete admin-only), with an optional
  reason, wired through `app/admin/comment-actions.ts`
  (`moderateCommentAction`, `deleteCommentAction`) which `requireActor` + `revalidatePath`.

## Status semantics

- **PENDING** — submitted, not public.
- **APPROVED** — public.
- **REJECTED** / **HIDDEN** — not public (rejected = declined; hidden = pulled after
  the fact). Both disappear from `listApprovedForArticle`.
