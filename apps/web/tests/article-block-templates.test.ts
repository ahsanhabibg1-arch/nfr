import { describe, it, expect } from 'vitest';

/**
 * The insertable block templates.
 *
 * THE ONE THING THAT MATTERS MOST HERE. A template is inserted into a live
 * article and then saved, often before the author has filled it in. If any
 * template's starting payload is something `articleBlockSchema` refuses, the
 * article becomes UNSAVEABLE the moment it is inserted — the author would see
 * "Article body block N cannot be saved" and have no idea which control did it.
 * So every template is parsed through the real schema below, not eyeballed.
 *
 * The templates are also what both the toolbar Insert menu and the `/` menu are
 * built from, which is why the slash vocabulary is pinned: a duplicate or
 * missing alias is a control that silently does the wrong thing.
 */

const { INSERTABLE_BLOCKS, insertableBlock, matchSlashCommand } =
  await import('../lib/content/articleBlockTemplates');
const { articleBlockSchema, reconcileBlockInline } = await import('../lib/content/articleBlockSchema');
const { isProseBlock } = await import('../lib/content/articleRichTextAdapter');

describe('every insertable template is saveable the moment it is inserted', () => {
  for (const def of INSERTABLE_BLOCKS) {
    it(`${def.key} passes the save boundary unfilled`, () => {
      const built = def.build();
      const parsed = articleBlockSchema.safeParse(built);
      expect(
        parsed.success,
        `the "${def.label}" template is refused by the schema: ${
          parsed.success ? '' : JSON.stringify(parsed.error.issues)
        }`,
      ).toBe(true);
      if (!parsed.success) return;
      // And it survives reconciliation, which runs on the same save.
      expect(() => reconcileBlockInline(parsed.data)).not.toThrow();
    });
  }

  it('builds a fresh object each time, so two inserts cannot share state', () => {
    const a = insertableBlock('table')!.build() as { rows: string[][] };
    const b = insertableBlock('table')!.build() as { rows: string[][] };
    a.rows[0][0] = 'edited';
    expect(b.rows[0][0]).not.toBe('edited');
  });
});

describe('what each template is', () => {
  it('offers a comparison table as a captioned table, not a new block type', () => {
    // A separate type would mean a new schema entry, a new renderer branch and
    // a new revision path for a table with a different caption.
    const built = insertableBlock('comparisonTable')!.build();
    expect(built.type).toBe('table');
    expect((built as { caption?: string }).caption).toBe('Comparison');
  });

  it('offers a key takeaway as a callout variant the renderer already draws', () => {
    const built = insertableBlock('takeaway')!.build();
    expect(built.type).toBe('callout');
    expect((built as { variant?: string }).variant).toBe('takeaway');
  });

  it('marks an attributed quote as NON-prose, so its attribution cannot be lost', () => {
    // An attributed quote has no rich-text equivalent: the cite line would
    // vanish on the next save if it travelled as a blockquote.
    expect(isProseBlock(insertableBlock('quote')!.build())).toBe(false);
  });

  it('inserts only block types the public renderer can draw', async () => {
    const { ARTICLE_BLOCK_TYPES } = await import('../lib/content/articleBlockSchema');
    for (const def of INSERTABLE_BLOCKS) {
      expect(ARTICLE_BLOCK_TYPES as readonly string[]).toContain(def.build().type);
    }
  });
});

describe('the slash vocabulary', () => {
  it('gives every entry at least one alias, with no duplicates across entries', () => {
    const seen = new Map<string, string>();
    for (const def of INSERTABLE_BLOCKS) {
      expect(def.slash.length, `${def.key} has no slash alias`).toBeGreaterThan(0);
      for (const alias of def.slash) {
        expect(alias, `"${alias}" is not lower-case`).toBe(alias.toLowerCase());
        expect(seen.has(alias), `"${alias}" is claimed by both ${seen.get(alias)} and ${def.key}`).toBe(false);
        seen.set(alias, def.key);
      }
    }
  });

  it('lists everything for an empty query, so "/" alone is a menu', () => {
    expect(matchSlashCommand('')).toHaveLength(INSERTABLE_BLOCKS.length);
    expect(matchSlashCommand('   ')).toHaveLength(INSERTABLE_BLOCKS.length);
  });

  it('ranks an exact alias first', () => {
    // "table" is also a substring of nothing else here, but "compare" vs
    // "comparison" is the case that matters: the typed word wins.
    expect(matchSlashCommand('table')[0].key).toBe('table');
    expect(matchSlashCommand('vs')[0].key).toBe('comparisonTable');
    expect(matchSlashCommand('cite')[0].key).toBe('sourceLink');
  });

  it('matches a prefix and is case-insensitive', () => {
    expect(matchSlashCommand('img')[0].key).toBe('image');
    expect(matchSlashCommand('IMG')[0].key).toBe('image');
    expect(matchSlashCommand('disc')[0].key).toBe('disclosure');
  });

  it('returns nothing for a query that matches nothing', () => {
    // An empty list is what keeps the menu closed instead of offering a
    // meaningless first option the author would insert by pressing Enter.
    expect(matchSlashCommand('zzzz')).toEqual([]);
  });

  it('returns a copy, so a caller cannot mutate the definition list', () => {
    const first = matchSlashCommand('');
    first.length = 0;
    expect(matchSlashCommand('')).toHaveLength(INSERTABLE_BLOCKS.length);
  });
});
