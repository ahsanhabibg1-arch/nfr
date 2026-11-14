'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { MediaPickerModal } from './MediaPickerModal';
import { isAllowedMediaSrc } from '../../../lib/cms/sanitizeHtml';

/**
 * The information-page body editor (PM-02).
 *
 * WHY TIPTAP OVER HTML, AND NOT THE ARTICLE EDITOR.
 *
 * `RichTextBodyEditor` is the richer editor, but it reads and writes
 * `ContentBlock[]`. An information page stores a single HTML string, and every
 * existing page — including the compiled-in policy copy — is HTML. Moving to
 * blocks would be a storage-format change with a migration behind it, for a
 * page family whose content is prose, tables and the occasional image. So this
 * reuses the same TipTap foundation while keeping `getHTML()` / `setContent()`
 * as the boundary: the stored format does not change, legacy HTML opens
 * unchanged, and the server sanitiser remains the authority on what may be
 * saved.
 *
 * THE EDITOR IS NOT A SECURITY BOUNDARY. `sanitizeLegalHtml` runs on save and
 * again on render. This component's restrictions exist so an author sees what
 * will survive, not to decide it.
 */

const BTN =
  'inline-flex items-center justify-center h-7 min-w-7 px-2 text-[12px] leading-none font-sans rounded-xs border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40';
const BTN_ON = 'bg-[#0F1115] text-[#D4A757] border-[#0F1115] hover:bg-[#0F1115]';

interface ToolButton {
  label: string;
  title: string;
  isActive?: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const GROUPS: { name: string; buttons: ToolButton[] }[] = [
  {
    name: 'Text style',
    buttons: [
      { label: 'B', title: 'Bold', isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
      { label: 'I', title: 'Italic', isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
      { label: 'U', title: 'Underline', isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
      { label: 'S', title: 'Strikethrough', isActive: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
    ],
  },
  {
    name: 'Structure',
    buttons: [
      { label: 'P', title: 'Paragraph', isActive: (e) => e.isActive('paragraph'), run: (e) => e.chain().focus().setParagraph().run() },
      { label: 'H2', title: 'H2 section heading', isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
      { label: 'H3', title: 'H3 subheading', isActive: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
      { label: 'H4', title: 'H4 sub-section heading', isActive: (e) => e.isActive('heading', { level: 4 }), run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run() },
    ],
  },
  {
    name: 'Lists and quotes',
    buttons: [
      { label: '• List', title: 'Bullet list', isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
      { label: '# List', title: 'Numbered list', isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
      { label: 'Quote', title: 'Blockquote', isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
      { label: '—', title: 'Divider', run: (e) => e.chain().focus().setHorizontalRule().run() },
    ],
  },
  {
    name: 'History',
    buttons: [
      { label: '↶', title: 'Undo', run: (e) => e.chain().focus().undo().run() },
      { label: '↷', title: 'Redo', run: (e) => e.chain().focus().redo().run() },
    ],
  },
];

/**
 * WCAG 2.5.3 "Label in Name": the accessible name must contain the visible
 * text, so a control can be activated by saying what is on it. Prefixing only
 * where the glyph is absent keeps the common buttons announcing cleanly
 * ("Bold", not "B — Bold").
 */
function accessibleName(label: string, title: string): string {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(title).includes(norm(label)) ? title : `${label} — ${title}`;
}

export interface InfoPageBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Re-seeds the editor when the host loads a different page. */
  documentKey?: string;
}

export const InfoPageBodyEditor: React.FC<InfoPageBodyEditorProps> = ({
  value, onChange, disabled = false, documentKey,
}) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  const editor = useEditor({
    /**
     * Required for a component that also renders on the server during the
     * admin's initial paint; without it React reports a hydration mismatch
     * against TipTap's client-generated DOM.
     */
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: false }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value || '<p></p>',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'prose-editor block w-full max-w-none min-h-[18rem] py-3 outline-none text-stone-900 font-sans text-[15px] leading-[1.7] focus:outline-none',
        'aria-label': 'Page body',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  /**
   * Re-seed only when the HOST switches document, never on every keystroke.
   * Writing `value` back into the editor whenever it changed would fight the
   * user's own typing, because `onUpdate` is what produced that value.
   */
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, editor]);

  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);

  const openLink = useCallback(() => {
    if (!editor) return;
    setLinkValue((editor.getAttributes('link').href as string) ?? '');
    setLinkError(null);
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkValue.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    /**
     * Mirrors the server sanitiser's `allowedSchemes`. Offering an author a
     * `javascript:` link that the save would silently discard is worse than
     * refusing it here, where the reason can be given.
     */
    const ok = /^(https?:\/\/|mailto:|\/)/i.test(href);
    if (!ok) {
      setLinkError('Use a site path starting with /, an http(s):// address, or mailto:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  }, [editor, linkValue]);

  if (!editor) {
    return <div className="min-h-[18rem] border border-stone-200 rounded-sm bg-white p-3 text-xs text-stone-500">Loading editor…</div>;
  }

  return (
    <div className="border border-stone-200 rounded-sm bg-white" data-testid="info-body-editor">
      <div
        role="toolbar"
        aria-label="Page body formatting"
        className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 border-b border-stone-200 bg-stone-50/80 rounded-t-sm"
      >
        {GROUPS.map((group, gi) => (
          <React.Fragment key={group.name}>
            {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />}
            <span className="sr-only">{group.name}</span>
            {group.buttons.map((b) => {
              const active = b.isActive?.(editor) ?? false;
              return (
                <button
                  key={b.label}
                  type="button"
                  title={b.title}
                  aria-label={accessibleName(b.label, b.title)}
                  aria-pressed={b.isActive ? active : undefined}
                  disabled={disabled}
                  // The selection must survive the click: mousedown would
                  // otherwise blur the editor and collapse it before onClick.
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => b.run(editor)}
                  className={`${BTN} ${active ? BTN_ON : 'text-stone-700'}`}
                >
                  {b.label}
                </button>
              );
            })}
          </React.Fragment>
        ))}

        <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />
        <span className="sr-only">Insert</span>
        <button
          type="button"
          title="Insert or edit link"
          aria-label="Insert or edit link"
          aria-pressed={editor.isActive('link')}
          disabled={disabled}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={openLink}
          className={`${BTN} ${editor.isActive('link') ? BTN_ON : 'text-stone-700'}`}
        >
          Link
        </button>
        <button
          type="button"
          title="Insert an image from the Media Library"
          aria-label="Insert an image from the Media Library"
          disabled={disabled}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => setImageOpen(true)}
          className={`${BTN} text-stone-700`}
        >
          Image
        </button>
      </div>

      {linkOpen && (
        <div className="p-3 border-b border-stone-200 bg-[#F7F3EA] space-y-2">
          <label htmlFor="info-link" className="block text-[10px] font-mono uppercase text-stone-500">Link target</label>
          <div className="flex flex-wrap gap-2">
            <input
              id="info-link"
              autoFocus
              value={linkValue}
              onChange={(e) => { setLinkValue(e.target.value); setLinkError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                if (e.key === 'Escape') { e.preventDefault(); setLinkOpen(false); }
              }}
              placeholder="/privacy/  or  https://example.com/"
              className="flex-1 min-w-[16rem] p-2 text-xs bg-white border border-stone-200 rounded-xs"
            />
            <button type="button" onClick={applyLink} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Apply</button>
            <button type="button" onClick={() => setLinkOpen(false)} className={`${BTN} bg-white`}>Cancel</button>
          </div>
          {linkError
            ? <p role="alert" className="text-[11px] text-rose-700">{linkError}</p>
            : <p className="text-[11px] text-stone-500">Leave empty and apply to remove a link. Internal paths stay in the site.</p>}
        </div>
      )}

      <div className="px-3">
        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-stone-200 bg-stone-50/80 text-[11px] font-mono text-stone-500 rounded-b-sm">
        <span>Images come from the Media Library</span>
        <span aria-hidden>·</span>
        <span>Unsafe HTML is removed when you save</span>
      </div>

      <MediaPickerModal
        isOpen={imageOpen}
        onClose={() => setImageOpen(false)}
        onSelect={(media) => {
          setImageOpen(false);
          /**
           * Refused rather than inserted when the picker returns a custom URL
           * the site does not serve. The server would discard it on save, and
           * an image that vanishes between writing and publishing is the kind
           * of thing an author only discovers on the live page.
           */
          if (!isAllowedMediaSrc(media.url)) {
            setLinkError(null);
            window.alert('That image is not served by this site, so it would be removed when the page is saved. Upload it to the Media Library first.');
            return;
          }
          editor.chain().focus().setImage({ src: media.url, alt: media.altText || '' }).run();
        }}
      />
    </div>
  );
};

export default InfoPageBodyEditor;
