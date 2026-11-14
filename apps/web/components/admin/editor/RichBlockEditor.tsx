'use client';

import React, { useState } from 'react';
import { ContentBlock } from '../../../types';
import { toBodyHeadingLevel, type BodyHeadingLevel } from '../../../lib/content/articleBlockStyle';
import { blockHasInlineFormatting } from '../../../lib/content/articleInline';
import { InlineText } from '../../editorial/InlineText';
import { MediaPickerModal } from './MediaPickerModal';
import {
  parseVideoReference, videoWatchUrl, VIDEO_PROVIDER_LABEL,
} from '../../../lib/content/articleEmbeds';
import { insertableBlock } from '../../../lib/content/articleBlockTemplates';

/**
 * Read-only rendering of a formatted block, using the SAME renderer the public
 * page uses.
 *
 * Sharing `InlineText` rather than writing a second preview means the author
 * sees exactly the marks that will publish, and there is one place where runs
 * become elements — so the preview cannot drift from the article.
 */
const InlineBlockPreview: React.FC<{ block: ContentBlock }> = ({ block }) => {
  switch (block.type) {
    case 'paragraph':
    case 'callout':
      return <InlineText text={block.text} runs={block.runs} />;
    case 'heading':
      return <strong><InlineText text={block.text} runs={block.runs} /></strong>;
    case 'quote':
      return <em>&ldquo;<InlineText text={block.quote} runs={block.quoteRuns} />&rdquo;</em>;
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={i}><InlineText text={item} runs={block.itemRuns?.[i] ?? null} /></li>
          ))}
        </ul>
      );
    default:
      return <span className="font-mono text-[11px] text-stone-500">[{block.type}]</span>;
  }
};

interface RichBlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  /**
   * Hands editing of a FORMATTED block back to the Write surface. Supplied by
   * the editor shell, which owns the view toggle. Without it a formatted block
   * is still protected — it simply says where to go instead of offering a
   * button.
   */
  onEditInWrite?: () => void;
  /**
   * Edits ONE block in place, inside the Write surface.
   *
   * The Write editor mounts this component scoped to a single structured block
   * so an author can fill in a table or an image without leaving the writing
   * surface — which is the requirement that Blocks view must not be a detour
   * for ordinary content creation. Reusing this component rather than
   * rebuilding its forms is the whole point: there is one set of structured
   * fields, so the two surfaces cannot drift, and the metadata the SEO and
   * rights gates depend on is captured identically from both.
   *
   * In that mode the document-level furniture (the word-count strip and the
   * "add a block" toolbar) is hidden, because the surrounding editor already
   * owns both.
   */
  compact?: boolean;
}

export const RichBlockEditor: React.FC<RichBlockEditorProps> = ({
  blocks, onChange, onEditInWrite, compact = false,
}) => {
  const [activeBlockMenu, setActiveBlockMenu] = useState<number | null>(null);
  /** Which image block the Media Library is currently picking for. */
  const [mediaFor, setMediaFor] = useState<number | null>(null);
  /** Which gallery block the Media Library is adding an image to. */
  const [galleryFor, setGalleryFor] = useState<number | null>(null);
  /**
   * Per-block message for a video link that could not be parsed.
   *
   * Keyed by block index because several video blocks can be on screen at
   * once, and one bad paste must not put an error under all of them.
   */
  const [videoRefError, setVideoRefError] = useState<Record<number, string | null>>({});

  // Helper to update a specific block
  const updateBlock = (index: number, updated: ContentBlock) => {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  };

  // Move block up
  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === blocks.length - 1)) {
      return;
    }
    const target = direction === 'up' ? index - 1 : index + 1;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  // Remove block
  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next);
  };

  // Duplicate block
  const duplicateBlock = (index: number) => {
    const next = [...blocks];
    const clone = JSON.parse(JSON.stringify(blocks[index]));
    next.splice(index + 1, 0, clone);
    onChange(next);
  };

  // Insert a new block at index
  const addBlock = (type: ContentBlock['type'], insertAtIndex?: number, headingLevel: BodyHeadingLevel = 2) => {
    let newBlock: ContentBlock;

    switch (type) {
      case 'heading':
        newBlock = { type: 'heading', level: headingLevel, text: '' };
        break;
      case 'paragraph':
        newBlock = { type: 'paragraph', text: '', isDropCap: false };
        break;
      case 'quote':
        newBlock = {
          type: 'quote',
          quote: '',
          attribution: '',
          role: 'PRCA Competitor / Official',
        };
        break;
      case 'table':
        newBlock = {
          type: 'table',
          headers: ['Criteria / Round', 'Scoring Physics', 'Judicial Weight'],
          rows: [
            ['Rider Control', 'Upright posture & spur stroke timing', '50 Points Max'],
            ['Stock Bucking Action', 'Drop, kick, spin & forward velocity', '50 Points Max'],
          ],
          caption: 'Standard Scoring Protocol',
        };
        break;
      case 'callout':
        newBlock = {
          type: 'callout',
          variant: 'takeaway',
          title: 'Editorial Takeaway',
          text: '',
        };
        break;
      case 'image':
        newBlock = {
          type: 'image',
          src: '/assets/images/hero_bull_riding_1793166440262.jpg',
          alt: 'Action photograph of rodeo roughstock competitor',
          caption: 'Championship action inside the Thomas & Mack Center arena.',
          credit: 'Editorial Staff Archives / NFRGuide',
        };
        break;
      case 'sourceLink':
        newBlock = {
          type: 'sourceLink',
          title: 'PRCA Official Rule Book (Championship Edition)',
          url: 'https://prorodeo.com/rules',
          publisher: 'Professional Rodeo Cowboys Association',
          note: 'Rule 14.2 — Scoring and disqualification regulations.',
        };
        break;
      case 'list':
        newBlock = {
          type: 'list',
          ordered: false,
          items: ['Key takeaway point 1', 'Key takeaway point 2', 'Key takeaway point 3'],
        };
        break;
      case 'disclosure':
        newBlock = { type: 'disclosure', text: '', variant: 'editorial' };
        break;
      case 'divider':
        newBlock = { type: 'divider' };
        break;
      /**
       * The newer block types come from the shared templates, which the Write
       * surface's Insert menu also builds from — so a question set created
       * here and one created there start identically, and there is one place
       * to change a starting payload.
       */
      case 'faq':
      case 'footnotes':
      case 'gallery':
      case 'video': {
        const template = insertableBlock(type);
        /*
          THE FALLBACK IS A PARAGRAPH ONLY BECAUSE SOMETHING MUST BE INSERTED.

          This cannot happen while every case above has a template, and the
          unit tests assert that. It is here rather than a `!` so that adding a
          block type and forgetting its template inserts a visible empty
          paragraph instead of crashing the editor mid-article.
        */
        newBlock = template ? template.build() : { type: 'paragraph', text: '' };
        break;
      }
      default:
        newBlock = { type: 'paragraph', text: '' };
    }

    const next = [...blocks];
    if (insertAtIndex !== undefined) {
      next.splice(insertAtIndex + 1, 0, newBlock);
    } else {
      next.push(newBlock);
    }
    onChange(next);
    setActiveBlockMenu(null);
  };

  // Word count & read time calculations
  const totalWords = blocks.reduce((acc, b) => {
    if (b.type === 'paragraph') return acc + b.text.split(/\s+/).filter(Boolean).length;
    if (b.type === 'heading') return acc + b.text.split(/\s+/).filter(Boolean).length;
    if (b.type === 'quote') return acc + (b.quote + ' ' + b.attribution).split(/\s+/).filter(Boolean).length;
    if (b.type === 'callout') return acc + b.text.split(/\s+/).filter(Boolean).length;
    if (b.type === 'list') return acc + b.items.join(' ').split(/\s+/).filter(Boolean).length;
    return acc;
  }, 0);

  const estimatedMinutes = Math.max(1, Math.ceil(totalWords / 225));

  return (
    <div className="space-y-4">
      {/* Metrics Strip */}
      {!compact && (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xs text-xs font-sans">
        <div className="flex items-center gap-4 text-stone-600">
          <span>
            Structured Blocks: <strong className="font-mono text-stone-900">{blocks.length}</strong>
          </span>
          <span className="text-stone-300">|</span>
          <span>
            Body Word Count: <strong className="font-mono text-stone-900">{totalWords.toLocaleString()}</strong> words
          </span>
          <span className="text-stone-300">|</span>
          <span>
            Est. Reading Time: <strong className="font-mono text-[#8B5E3C]">{estimatedMinutes} min read</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
          <span>Model: Typed JSON Blocks</span>
        </div>
      </div>
      )}

      {/* Block List */}
      <div className="space-y-4">
        {blocks.map((block, index) => (
          <div
            key={index}
            className="group relative bg-white border border-stone-200 hover:border-stone-400 rounded-xs shadow-2xs transition-all"
          >
            {/* Block Header Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-stone-50 border-b border-stone-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                  #{index + 1}
                </span>
                <span className="font-mono text-[11px] font-semibold text-stone-700 bg-white border border-stone-200 px-1.5 py-0.5 rounded-xs capitalize">
                  {block.type === 'heading' ? `Heading ${block.level}` : block.type}
                </span>
                {block.type === 'paragraph' && (
                  <label className="flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      checked={Boolean(block.isDropCap)}
                      onChange={(e) => updateBlock(index, { ...block, isDropCap: e.target.checked })}
                      className="rounded-xs text-[#D4A757] focus:ring-0"
                    />
                    <span>Drop Cap</span>
                  </label>
                )}
                {block.type === 'heading' && (
                  <select
                    value={block.level}
                    onChange={(e) => updateBlock(index, { ...block, level: toBodyHeadingLevel(e.target.value) })}
                    className="text-[11px] font-mono bg-white border border-stone-200 rounded-xs px-1.5 py-0.5 text-stone-700"
                  >
                    <option value={2}>H2 (Major Section)</option>
                    <option value={3}>H3 (Sub-Topic)</option>
                    <option value={4}>H4 (Sub-Point)</option>
                  </select>
                )}
                {block.type === 'callout' && (
                  <select
                    value={block.variant}
                    onChange={(e) => updateBlock(index, { ...block, variant: e.target.value as any })}
                    className="text-[11px] font-mono bg-white border border-stone-200 rounded-xs px-1.5 py-0.5 text-stone-700"
                  >
                    <option value="takeaway">Editorial Takeaway (Gold)</option>
                    <option value="info">Informational Note (Sand)</option>
                    <option value="warning">Advisory / Warning (Amber)</option>
                    <option value="curator">Curator Dispatch (Neutral)</option>
                  </select>
                )}
                {block.type === 'list' && (
                  <select
                    value={block.checklist ? 'checklist' : block.ordered ? 'ordered' : 'unordered'}
                    onChange={(e) => {
                      const style = e.target.value;
                      updateBlock(index, {
                        ...block,
                        ordered: style === 'ordered',
                        // A checklist is a style of list, so switching away from
                        // it drops the ticks along with it rather than leaving
                        // `checked` behind on a bulleted list that ignores it.
                        ...(style === 'checklist'
                          ? { checklist: true, checked: block.items.map((_, i) => block.checked?.[i] === true) }
                          : { checklist: undefined, checked: undefined }),
                      });
                    }}
                    className="text-[11px] font-mono bg-white border border-stone-200 rounded-xs px-1.5 py-0.5 text-stone-700"
                  >
                    <option value="unordered">Bullet List (&bull;)</option>
                    <option value="ordered">Numbered List (1, 2, 3)</option>
                    <option value="checklist">Checklist (&#9745;)</option>
                  </select>
                )}
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(index, 'up')}
                  disabled={index === 0}
                  className="p-1 text-ink-muted hover:text-stone-700 disabled:opacity-20 transition-colors"
                  title="Move Block Up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(index, 'down')}
                  disabled={index === blocks.length - 1}
                  className="p-1 text-ink-muted hover:text-stone-700 disabled:opacity-20 transition-colors"
                  title="Move Block Down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => duplicateBlock(index)}
                  className="p-1 text-ink-muted hover:text-stone-700 transition-colors"
                  title="Duplicate Block"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className="p-1 text-ink-muted hover:text-rose-600 transition-colors"
                  title="Delete Block"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Block Content Canvas */}
            <div className="p-4">
              {/*
                FORMATTING PROTECTION (owner decision: formatting loss is
                prohibited).

                This view edits text with a plain field and writes back
                `{ ...block, text: newValue }`. That keeps `runs` while changing
                `text`, so the projection stops matching and the save discards
                the formatting — silently. A block that carries inline
                formatting therefore shows its content read-only and sends the
                author to the Write surface.

                Everything that does NOT touch the text stays available here:
                reorder, duplicate, delete, and the block's own structural
                controls above.
              */}
              {blockHasInlineFormatting(block) ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-xs bg-[#F7F3EA] border border-[#8B5E3C]/30 text-[#8B5E3C]">
                      Formatted text
                    </span>
                    {onEditInWrite && (
                      <button
                        type="button"
                        onClick={onEditInWrite}
                        className="px-2.5 py-1 text-[11px] font-sans font-semibold bg-[#0F1115] text-[#D4A757] rounded-xs"
                      >
                        Edit in Write
                      </button>
                    )}
                  </div>
                  <div className="text-sm font-sans text-stone-800 leading-relaxed border border-stone-200 rounded-xs p-3 bg-stone-50/60">
                    <InlineBlockPreview block={block} />
                  </div>
                  <p className="text-[11px] text-stone-500">
                    This block contains bold, italic, underline, strikethrough or a link. Editing it as plain text
                    here would discard that formatting, so it is read-only in this view. Reordering, duplicating and
                    deleting still work.
                  </p>
                </div>
              ) : (
              <>
              {block.type === 'paragraph' && (
                <div className="space-y-1">
                  <textarea
                    rows={3}
                    value={block.text}
                    onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                    placeholder="Write authoritative editorial analysis or dispatch text..."
                    className="w-full text-sm font-sans text-stone-800 leading-relaxed bg-transparent border-0 focus:ring-0 p-0 resize-y placeholder:text-stone-300"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-ink-muted pt-1">
                    <span>{block.text.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{block.text.length} chars</span>
                  </div>
                </div>
              )}

              {block.type === 'heading' && (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={block.text}
                    onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                    placeholder={
                      block.level === 2 ? 'Section Subheading (H2)...'
                        : block.level === 3 ? 'Sub-Topic Heading (H3)...'
                          : 'Sub-Point Heading (H4)...'
                    }
                    className={`w-full font-serif font-bold text-stone-900 bg-transparent border-0 focus:ring-0 p-0 placeholder:text-stone-300 ${
                      block.level === 2 ? 'text-xl' : block.level === 3 ? 'text-lg' : 'text-base'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-ink-muted block">
                    ID slug: #{block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
                  </span>
                </div>
              )}

              {block.type === 'quote' && (
                <div className="space-y-3 bg-stone-50/60 p-3 rounded-xs border border-stone-200">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                      Direct Quote Text
                    </label>
                    <textarea
                      rows={2}
                      value={block.quote}
                      onChange={(e) => updateBlock(index, { ...block, quote: e.target.value })}
                      placeholder="“When the chute gate cracks, you have 0.3 seconds to match the animal’s shoulder extension...”"
                      className="w-full text-sm font-serif italic text-stone-800 bg-white border border-stone-200 rounded-xs p-2 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                        Attribution
                      </label>
                      <input
                        type="text"
                        value={block.attribution}
                        onChange={(e) => updateBlock(index, { ...block, attribution: e.target.value })}
                        placeholder="e.g. Clayton Vance"
                        className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                        Role / Context
                      </label>
                      <input
                        type="text"
                        value={block.role || ''}
                        onChange={(e) => updateBlock(index, { ...block, role: e.target.value })}
                        placeholder="e.g. 5-Time World Champion"
                        className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {block.type === 'callout' && (
                <div className="space-y-2 bg-[#F7F3EA] p-3 rounded-xs border-l-4 border-[#8B5E3C]">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8B5E3C] font-semibold mb-1">
                      Callout Title / Label
                    </label>
                    <input
                      type="text"
                      value={block.title || ''}
                      onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                      placeholder="e.g. Key Takeaway &bull; AI Overview Answer Capsule"
                      className="w-full text-xs font-bold text-stone-900 bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                      Callout Body
                    </label>
                    <textarea
                      rows={2}
                      value={block.text}
                      onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                      placeholder="2–3 sentence direct factual answer or critical spectator advisory..."
                      className="w-full text-xs font-sans text-stone-800 bg-white border border-stone-200 rounded-xs p-2 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                </div>
              )}

              {block.type === 'list' && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                    List Items ({block.items.length})
                  </div>
                  {block.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex items-center gap-2">
                      {block.checklist ? (
                        /*
                          THE TICK IS EDITORIAL STATE, SO IT IS EDITABLE HERE.

                          `checked` is positional and parallel to `items`, which
                          is why removing an item below rebuilds BOTH arrays
                          together: dropping one from `items` alone would shift
                          every tick after it onto the wrong line.
                        */
                        <label className="flex items-center" title={`Item ${itemIdx + 1} complete`}>
                          <input
                            type="checkbox"
                            checked={block.checked?.[itemIdx] === true}
                            onChange={(e) => {
                              const nextChecked = block.items.map((_, i) =>
                                i === itemIdx ? e.target.checked : block.checked?.[i] === true,
                              );
                              updateBlock(index, { ...block, checked: nextChecked });
                            }}
                            className="rounded-xs text-[#D4A757] focus:ring-0"
                          />
                          <span className="sr-only">Mark item {itemIdx + 1} complete</span>
                        </label>
                      ) : (
                        <span className="font-mono text-xs text-ink-muted w-4 text-right">
                          {block.ordered ? `${itemIdx + 1}.` : '•'}
                        </span>
                      )}
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const nextItems = [...block.items];
                          nextItems[itemIdx] = e.target.value;
                          updateBlock(index, { ...block, items: nextItems });
                        }}
                        className="flex-1 text-xs font-sans text-stone-800 border border-stone-200 rounded-xs p-1.5 bg-white focus:outline-none focus:border-[#D4A757]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const keep = (_: unknown, i: number) => i !== itemIdx;
                          updateBlock(index, {
                            ...block,
                            items: block.items.filter(keep),
                            ...(block.checklist
                              ? { checked: block.items.map((_, i) => block.checked?.[i] === true).filter(keep) }
                              : {}),
                          });
                        }}
                        className="text-ink-muted hover:text-rose-500 p-1"
                        title="Remove item"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      updateBlock(index, {
                        ...block,
                        items: [...block.items, 'New item'],
                        ...(block.checklist
                          ? { checked: [...block.items.map((_, i) => block.checked?.[i] === true), false] }
                          : {}),
                      });
                    }}
                    className="text-xs font-mono text-[#8B5E3C] hover:underline pt-1 inline-flex items-center gap-1"
                  >
                    + Add List Item
                  </button>
                </div>
              )}

              {block.type === 'table' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={block.caption || ''}
                      onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                      placeholder="Table Caption / Title..."
                      className="text-xs font-semibold text-stone-800 bg-transparent border-b border-stone-200 focus:outline-none focus:border-[#D4A757] pb-1 w-1/2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newHeaders = [...block.headers, `Column ${block.headers.length + 1}`];
                          const newRows = block.rows.map((r) => [...r, 'Data']);
                          updateBlock(index, { ...block, headers: newHeaders, rows: newRows });
                        }}
                        className="text-[10px] font-mono px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded-xs text-stone-700"
                      >
                        + Add Column
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newRow = new Array(block.headers.length).fill('Cell Value');
                          updateBlock(index, { ...block, rows: [...block.rows, newRow] });
                        }}
                        className="text-[10px] font-mono px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded-xs text-stone-700"
                      >
                        + Add Row
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-stone-200 rounded-xs">
                    <table className="w-full text-xs font-sans">
                      <thead>
                        <tr className="bg-stone-100 border-b border-stone-200">
                          {block.headers.map((h, hIdx) => (
                            <th key={hIdx} className="p-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={h}
                                  onChange={(e) => {
                                    const nextH = [...block.headers];
                                    nextH[hIdx] = e.target.value;
                                    updateBlock(index, { ...block, headers: nextH });
                                  }}
                                  className="w-full text-xs font-bold text-stone-900 bg-transparent border-0 p-1 focus:bg-white"
                                />
                                {/*
                                  REMOVING A COLUMN MUST REMOVE IT FROM EVERY
                                  ROW. Dropping only the header would leave each
                                  row one cell longer than the header list, and
                                  the public renderer draws cells against
                                  headers — so the table would silently display
                                  the wrong data under the wrong column. The
                                  last column cannot be removed: a table with no
                                  columns is not a table.
                                */}
                                <button
                                  type="button"
                                  title={`Remove column ${hIdx + 1}`}
                                  aria-label={`Remove column ${hIdx + 1}`}
                                  disabled={block.headers.length <= 1}
                                  onClick={() => updateBlock(index, {
                                    ...block,
                                    headers: block.headers.filter((_, i) => i !== hIdx),
                                    rows: block.rows.map((r) => r.filter((_, i) => i !== hIdx)),
                                  })}
                                  className="text-ink-muted hover:text-rose-500 disabled:opacity-20 px-0.5"
                                >
                                  &times;
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="p-1.5 w-6" aria-label="Row controls" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 bg-white">
                        {block.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-1.5">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => {
                                    const nextRows = block.rows.map((r, ri) =>
                                      ri === rIdx
                                        ? r.map((c, ci) => (ci === cIdx ? e.target.value : c))
                                        : r
                                    );
                                    updateBlock(index, { ...block, rows: nextRows });
                                  }}
                                  className="w-full text-xs font-sans text-stone-700 bg-transparent border-0 p-1 focus:bg-stone-50"
                                />
                              </td>
                            ))}
                            <td className="p-1.5 align-middle">
                              <button
                                type="button"
                                title={`Remove row ${rIdx + 1}`}
                                aria-label={`Remove row ${rIdx + 1}`}
                                onClick={() => updateBlock(index, {
                                  ...block,
                                  rows: block.rows.filter((_, i) => i !== rIdx),
                                })}
                                className="text-ink-muted hover:text-rose-500 px-0.5"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {block.type === 'image' && (
                <div className="space-y-3 bg-stone-50 p-3 rounded-xs border border-stone-200">
                  <div className="flex gap-4 items-start">
                    {/*
                      An empty `src` is the state a freshly inserted image block
                      is in, and `<img src="">` re-requests the current page in
                      some browsers. So the placeholder is a box, not an image.
                    */}
                    {block.src ? (
                      <img
                        src={block.src}
                        alt={block.alt}
                        className="w-28 h-20 object-cover rounded-xs border border-stone-300 shrink-0"
                      />
                    ) : (
                      <div className="w-28 h-20 flex items-center justify-center text-center rounded-xs border border-dashed border-stone-300 bg-white shrink-0 text-[10px] font-mono text-stone-400 px-1">
                        No image chosen
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={block.src}
                          onChange={(e) => updateBlock(index, { ...block, src: e.target.value })}
                          placeholder="Image URL / Path..."
                          className="flex-1 text-xs font-mono bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                        />
                        {/*
                          THE LIBRARY IS THE PRIMARY ROUTE, THE FIELD THE ESCAPE
                          HATCH. Choosing an asset fills alt text, caption and
                          credit from the asset's own record, which is where the
                          rights gate reads them from — typing a bare URL leaves
                          the author to supply all three by hand, and a missing
                          one blocks publication later rather than here.
                        */}
                        <button
                          type="button"
                          onClick={() => setMediaFor(index)}
                          className="px-2 py-1 text-[11px] font-sans font-semibold whitespace-nowrap bg-[#0F1115] text-[#D4A757] rounded-xs hover:bg-stone-800"
                        >
                          {block.src ? 'Replace' : 'Media Library'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={block.alt}
                        onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                        placeholder="Descriptive ALT text for accessibility..."
                        className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={block.caption || ''}
                      onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                      placeholder="Photo Caption..."
                      className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                    <input
                      type="text"
                      value={block.credit || ''}
                      onChange={(e) => updateBlock(index, { ...block, credit: e.target.value })}
                      placeholder="Photographer / Archive Credit..."
                      className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                </div>
              )}

              {/*
                ---- QUESTIONS AND ANSWERS ----
                One block holds the whole set, so the fields are a list of
                pairs. An answer carries `runs`, so the formatting guard above
                protects a formatted answer from a plain-text edit here.
              */}
              {block.type === 'faq' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={block.title || ''}
                    onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                    placeholder="Section title (optional), e.g. Frequently asked"
                    className="w-full text-xs font-semibold text-stone-800 bg-transparent border-b border-stone-200 focus:outline-none focus:border-[#D4A757] pb-1"
                  />
                  {block.items.map((item, qIdx) => (
                    <div key={qIdx} className="p-2 bg-stone-50 border border-stone-200 rounded-xs space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[10px] text-ink-muted pt-2">Q{qIdx + 1}</span>
                        <input
                          type="text"
                          value={item.question}
                          onChange={(e) => updateBlock(index, {
                            ...block,
                            items: block.items.map((it, i) => (i === qIdx ? { ...it, question: e.target.value } : it)),
                          })}
                          placeholder="The question a reader asks..."
                          className="flex-1 text-xs font-sans font-semibold text-stone-900 bg-white border border-stone-200 rounded-xs p-1.5"
                        />
                        <button
                          type="button"
                          title={`Remove question ${qIdx + 1}`}
                          aria-label={`Remove question ${qIdx + 1}`}
                          onClick={() => updateBlock(index, {
                            ...block, items: block.items.filter((_, i) => i !== qIdx),
                          })}
                          className="text-ink-muted hover:text-rose-500 p-1"
                        >
                          &times;
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={item.answer}
                        onChange={(e) => updateBlock(index, {
                          ...block,
                          items: block.items.map((it, i) => (i === qIdx ? { ...it, answer: e.target.value } : it)),
                        })}
                        placeholder="The answer, in a sentence or two..."
                        className="w-full text-xs font-sans text-stone-800 bg-white border border-stone-200 rounded-xs p-1.5 resize-y"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateBlock(index, {
                      ...block, items: [...block.items, { question: '', answer: '' }],
                    })}
                    className="text-xs font-mono text-[#8B5E3C] hover:underline pt-1"
                  >
                    + Add Question
                  </button>
                </div>
              )}

              {/* ---- NOTES / FOOTNOTES ---- */}
              {block.type === 'footnotes' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={block.title || ''}
                    onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                    placeholder="Heading (optional) — defaults to Notes"
                    className="w-full text-xs font-semibold text-stone-800 bg-transparent border-b border-stone-200 focus:outline-none focus:border-[#D4A757] pb-1"
                  />
                  <p className="text-[11px] text-ink-muted">
                    Numbered by position. Mark the reference in the body with the superscript control in Write.
                  </p>
                  {block.items.map((item, nIdx) => (
                    <div key={nIdx} className="flex items-start gap-2">
                      <span className="font-mono text-xs text-ink-muted w-4 text-right pt-2">{nIdx + 1}.</span>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => updateBlock(index, {
                          ...block,
                          items: block.items.map((it, i) => (i === nIdx ? { ...it, text: e.target.value } : it)),
                        })}
                        placeholder="The note..."
                        className="flex-1 text-xs font-sans text-stone-800 bg-white border border-stone-200 rounded-xs p-1.5"
                      />
                      <button
                        type="button"
                        title={`Remove note ${nIdx + 1}`}
                        aria-label={`Remove note ${nIdx + 1}`}
                        onClick={() => updateBlock(index, {
                          ...block, items: block.items.filter((_, i) => i !== nIdx),
                        })}
                        className="text-ink-muted hover:text-rose-500 p-1"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateBlock(index, { ...block, items: [...block.items, { text: '' }] })}
                    className="text-xs font-mono text-[#8B5E3C] hover:underline pt-1"
                  >
                    + Add Note
                  </button>
                </div>
              )}

              {/* ---- IMAGE GALLERY ---- */}
              {block.type === 'gallery' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={block.layout || 'grid'}
                      onChange={(e) => updateBlock(index, { ...block, layout: e.target.value === 'row' ? 'row' : 'grid' })}
                      aria-label="Gallery layout"
                      className="text-[11px] font-mono bg-white border border-stone-200 rounded-xs px-1.5 py-0.5 text-stone-700"
                    >
                      <option value="grid">Grid</option>
                      <option value="row">Scrolling row</option>
                    </select>
                    <input
                      type="text"
                      value={block.caption || ''}
                      onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                      placeholder="Gallery caption (optional)..."
                      className="flex-1 min-w-[12rem] text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                    />
                    {/*
                      Images are added one at a time from the Media Library,
                      because that is how the picker works — and each arrives
                      with its own alt text, caption and credit from the asset
                      record. A reader using a screen reader meets each image
                      separately, so per-image alt text is not optional.
                    */}
                    <button
                      type="button"
                      onClick={() => setGalleryFor(index)}
                      className="px-2 py-1 text-[11px] font-sans font-semibold whitespace-nowrap bg-[#0F1115] text-[#D4A757] rounded-xs hover:bg-stone-800"
                    >
                      + Add image
                    </button>
                  </div>
                  {block.images.length === 0 && (
                    <p className="text-[11px] text-ink-muted">
                      Empty galleries are saved but not published until they contain an image.
                    </p>
                  )}
                  {block.images.map((img, iIdx) => (
                    <div key={iIdx} className="flex gap-2 items-start p-2 bg-stone-50 border border-stone-200 rounded-xs">
                      {img.src ? (
                        <img src={img.src} alt={img.alt} className="w-20 h-14 object-cover rounded-xs border border-stone-300 shrink-0" />
                      ) : (
                        <div className="w-20 h-14 rounded-xs border border-dashed border-stone-300 shrink-0" />
                      )}
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={img.alt}
                          onChange={(e) => updateBlock(index, {
                            ...block,
                            images: block.images.map((im, i) => (i === iIdx ? { ...im, alt: e.target.value } : im)),
                          })}
                          placeholder="Descriptive ALT text for this image..."
                          className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            value={img.caption || ''}
                            onChange={(e) => updateBlock(index, {
                              ...block,
                              images: block.images.map((im, i) => (i === iIdx ? { ...im, caption: e.target.value } : im)),
                            })}
                            placeholder="Caption..."
                            className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                          />
                          <input
                            type="text"
                            value={img.credit || ''}
                            onChange={(e) => updateBlock(index, {
                              ...block,
                              images: block.images.map((im, i) => (i === iIdx ? { ...im, credit: e.target.value } : im)),
                            })}
                            placeholder="Credit..."
                            className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        title={`Remove image ${iIdx + 1}`}
                        aria-label={`Remove image ${iIdx + 1}`}
                        onClick={() => updateBlock(index, {
                          ...block, images: block.images.filter((_, i) => i !== iIdx),
                        })}
                        className="text-ink-muted hover:text-rose-500 p-1"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ---- APPROVED VIDEO EMBED ---- */}
              {block.type === 'video' && (
                <div className="space-y-2 bg-stone-50 p-3 rounded-xs border border-stone-200">
                  <label className="block text-[10px] font-mono uppercase text-stone-500">
                    YouTube or Vimeo link
                    {/*
                      THE LINK IS PARSED, NOT STORED.

                      `parseVideoReference` turns what the author pasted into a
                      provider and an id, and only those two values are kept —
                      the public renderer builds the iframe URL from them. A
                      link that is not an approved provider's is refused here
                      rather than stored and discovered at render time.
                    */}
                    <input
                      type="text"
                      defaultValue={videoWatchUrl(block.provider, block.videoId) ?? ''}
                      onChange={(e) => {
                        const parsed = parseVideoReference(e.target.value);
                        setVideoRefError((prev) => ({ ...prev, [index]: parsed || !e.target.value.trim() ? null : 'Not a YouTube or Vimeo video link' }));
                        if (!parsed) return;
                        updateBlock(index, { ...block, provider: parsed.provider, videoId: parsed.id });
                      }}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="mt-1 w-full text-xs font-mono bg-white border border-stone-200 rounded-xs p-1.5"
                    />
                  </label>
                  {videoRefError[index] && (
                    <p role="alert" className="text-[11px] text-rose-700">{videoRefError[index]}</p>
                  )}
                  <label className="block text-[10px] font-mono uppercase text-stone-500">
                    What the video shows
                    <input
                      type="text"
                      value={block.title}
                      onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                      placeholder="Used as the frame's accessible name"
                      className="mt-1 w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                    />
                  </label>
                  <input
                    type="text"
                    value={block.caption || ''}
                    onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                    placeholder="Caption (optional)..."
                    className="w-full text-xs font-sans bg-white border border-stone-200 rounded-xs p-1.5"
                  />
                  <p className="text-[11px] text-ink-muted font-mono">
                    {block.videoId
                      ? `${VIDEO_PROVIDER_LABEL[block.provider]} · ${block.videoId}`
                      : 'No video chosen yet — this block is saved but not published.'}
                  </p>
                </div>
              )}

              {block.type === 'sourceLink' && (
                <div className="space-y-2 bg-stone-50 p-3 rounded-xs border border-stone-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={block.title}
                      onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                      placeholder="Source Title (e.g. PRCA Rule Book)..."
                      className="w-full text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                    <input
                      type="text"
                      value={block.publisher || ''}
                      onChange={(e) => updateBlock(index, { ...block, publisher: e.target.value })}
                      placeholder="Publishing Body (e.g. PRCA)..."
                      className="w-full text-xs font-sans text-stone-700 bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={block.url}
                      onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                      placeholder="Source URL (https://...)..."
                      className="w-full text-xs font-mono text-stone-600 bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                    <input
                      type="text"
                      value={block.note || ''}
                      onChange={(e) => updateBlock(index, { ...block, note: e.target.value })}
                      placeholder="Judicial Citation / Rule reference..."
                      className="w-full text-xs font-sans text-stone-600 bg-white border border-stone-200 rounded-xs p-1.5 focus:outline-none focus:border-[#D4A757]"
                    />
                  </div>
                </div>
              )}

              {block.type === 'disclosure' && (
                <div className="space-y-1">
                  <textarea
                    rows={2}
                    value={block.text}
                    onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                    placeholder="Reader transparency / FTC disclosure statement (e.g. affiliate relationship)..."
                    className="w-full text-sm font-sans italic text-stone-700 bg-stone-50 border border-stone-200 rounded-xs p-2 focus:ring-0 placeholder:text-stone-300"
                  />
                  <span className="text-[10px] font-mono text-ink-muted block">
                    Rendered inline as a reader disclosure notice in the published article.
                  </span>
                </div>
              )}

              {block.type === 'divider' && (
                <div className="py-2 text-center text-xs font-mono text-ink-muted">
                  <hr className="border-t border-stone-300 mb-1" />
                  <span>&mdash; Section Separator &mdash;</span>
                </div>
              )}
              </>
              )}
            </div>

            {/* Quick Insert between blocks button */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button
                type="button"
                onClick={() => setActiveBlockMenu(activeBlockMenu === index ? null : index)}
                className="px-2.5 py-0.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-[10px] font-mono uppercase tracking-wider rounded-full shadow-md flex items-center gap-1"
              >
                <span>+ Insert Below</span>
              </button>
            </div>

            {/* Contextual Insert Menu */}
            {activeBlockMenu === index && (
              <div className="p-3 bg-white border border-stone-300 rounded-xs shadow-lg mt-2 mx-4 mb-2 flex flex-wrap gap-2 text-xs animate-fade-in">
                <span className="text-[11px] font-mono text-ink-muted w-full mb-1">Select block type to insert:</span>
                {[
                  { label: '+ Paragraph', type: 'paragraph' as const },
                  { label: '+ Heading 2', type: 'heading' as const, level: 2 as const },
                  { label: '+ Heading 3', type: 'heading' as const, level: 3 as const },
                  { label: '+ Heading 4', type: 'heading' as const, level: 4 as const },
                  { label: '+ Quote', type: 'quote' as const },
                  { label: '+ Table', type: 'table' as const },
                  { label: '+ Callout', type: 'callout' as const },
                  { label: '+ Image', type: 'image' as const },
                  { label: '+ Source Link', type: 'sourceLink' as const },
                  { label: '+ List', type: 'list' as const },
                  { label: '+ Disclosure', type: 'disclosure' as const },
                  { label: '+ Q&A', type: 'faq' as const },
                  { label: '+ Notes', type: 'footnotes' as const },
                  { label: '+ Gallery', type: 'gallery' as const },
                  { label: '+ Video', type: 'video' as const },
                  { label: '+ Divider', type: 'divider' as const },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => addBlock(item.type, index, (item as { level?: BodyHeadingLevel }).level ?? 2)}
                    className="px-2 py-1 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xs transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Primary Add Block Toolbar at Bottom */}
      {!compact && (
      <div className="p-4 bg-stone-50 border border-dashed border-stone-300 rounded-xs space-y-2">
        <span className="text-xs font-mono uppercase tracking-wider text-ink-muted font-semibold block">
          Add Structured Editorial Block:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addBlock('paragraph')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="font-serif font-bold text-sm">¶</span>
            <span>Paragraph</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('heading', undefined, 2)}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="font-serif font-bold text-xs">H2</span>
            <span>Heading</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('heading', undefined, 3)}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="font-serif font-bold text-xs">H3</span>
            <span>Sub-Heading</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('quote')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="font-serif font-bold text-sm">“ ”</span>
            <span>Quote</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('callout')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-amber-600 font-bold">★</span>
            <span>Takeaway Callout</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('table')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="font-mono text-xs font-bold">⊞</span>
            <span>Comparison Table</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('list')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-ink-muted font-bold">&bull;</span>
            <span>Key List</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('image')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-ink-muted">🖼</span>
            <span>Inline Image</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('sourceLink')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-ink-muted">🔗</span>
            <span>Citation Link</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('disclosure')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-ink-muted italic font-serif">ⓘ</span>
            <span>Disclosure</span>
          </button>
          <button
            type="button"
            onClick={() => addBlock('divider')}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 hover:border-[#D4A757] hover:text-[#8B5E3C] text-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span className="text-ink-muted">&mdash;</span>
            <span>Divider</span>
          </button>
        </div>
      </div>
      )}

      {/*
        THE MEDIA LIBRARY, SHARED BY BOTH SURFACES.

        The same picker the article's hero image uses, so an in-body image is
        chosen from the same catalogue, with the same upload path and the same
        rights record — and its alt text, caption and credit arrive already
        filled from the asset instead of being retyped (and mistyped) per
        article.
      */}
      <MediaPickerModal
        isOpen={mediaFor !== null || galleryFor !== null}
        onClose={() => { setMediaFor(null); setGalleryFor(null); }}
        onSelect={(media) => {
          const imageTarget = mediaFor;
          const galleryTarget = galleryFor;
          setMediaFor(null);
          setGalleryFor(null);

          if (galleryTarget !== null) {
            const block = blocks[galleryTarget];
            if (!block || block.type !== 'gallery') return;
            // Appended, so the author builds the gallery one asset at a time
            // with each image's own alt text, caption and credit carried over.
            updateBlock(galleryTarget, {
              ...block,
              images: [...block.images, {
                src: media.url,
                alt: media.altText,
                ...(media.caption ? { caption: media.caption } : {}),
                ...(media.credit ? { credit: media.credit } : {}),
              }],
            });
            return;
          }

          if (imageTarget === null) return;
          const block = blocks[imageTarget];
          if (!block || block.type !== 'image') return;
          updateBlock(imageTarget, {
            ...block,
            src: media.url,
            // Only the fields the image block models are copied. `seoTitle` and
            // the rights status belong to the asset record and to the article's
            // hero image; storing them here would add fields nothing renders.
            alt: media.altText || block.alt,
            caption: media.caption || block.caption,
            credit: media.credit || block.credit,
          });
        }}
      />
    </div>
  );
};
