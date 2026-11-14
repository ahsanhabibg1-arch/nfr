import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_PAGES, getLegalPage } from '../config/legalPages';
import { resolvePublicInfoPage } from '../lib/cms/infoPageService';
import { sanitizeLegalHtml } from '../lib/cms/sanitizeHtml';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '../lib/seo';
import { resolveInfoPageTemplateSlots } from '../lib/cms/detailTemplateData';
import { ArticleAppendageSlots } from './ArticleAppendageSlots';
import { isStaffDraftPreview } from '../lib/cms/previewGuard';

/**
 * WHICH CONTENT A PUBLIC REQUEST GETS, and why the order matters.
 *
 * A CMS row always wins — including when it says the page is NOT live. That is
 * the correction: `withdrawn` means an operator took this page down, so the
 * compiled-in copy must not quietly take its place. Only `unmanaged` — no row
 * has ever existed for this slug — allows the built-in text to render, because
 * then it is the only content there is.
 */
async function resolve(slug: string) {
  const config = getLegalPage(slug);
  const cms = await resolvePublicInfoPage(slug);
  return { config, cms };
}

export async function legalPageMetadata(slug: string): Promise<Metadata> {
  const { config, cms } = await resolve(slug);
  if (cms.kind === 'withdrawn') {
    // Reachable only as a 404 body; never offered to search engines.
    return buildMetadata({ title: 'Page Not Available', description: '', path: `/info/${slug}/`, noindex: true });
  }
  const live = cms.kind === 'live' ? cms.page : null;
  if (!config && !live) return {};
  const path = config?.path || `/info/${slug}/`;
  /**
   * SEO comes from the SNAPSHOT, not from the live EntitySeo row.
   *
   * EntitySeo is the editing surface and stays authoritative there, but reading
   * it here would publish a draft SEO change the moment it was saved — the body
   * would wait for approval while the title and canonical did not. The snapshot
   * holds what was approved alongside this content.
   *
   * Pages published before PM-04 have no `seo` object and fall back to the
   * row's own columns, which is exactly what they rendered before.
   */
  const seo = live?.seo ?? null;
  return buildMetadata({
    title: seo?.seoTitle || live?.seoTitle || live?.title || config?.title || '',
    description: seo?.metaDescription || live?.metaDescription || config?.description || '',
    path,
    ...(seo?.canonicalOverride ? { canonical: seo.canonicalOverride } : {}),
    ...(seo?.ogImage ? { image: seo.ogImage } : {}),
    // An operator may noindex a live page; an unapproved built-in page is
    // noindex regardless, as before.
    noindex: seo?.noindex === true || (!live && (!config || config.review !== 'approved')),
  });
}

export async function LegalPageView({ slug }: { slug: string }) {
  const { config, cms } = await resolve(slug);
  // A page taken down on purpose is gone, not replaced by the built-in draft.
  if (cms.kind === 'withdrawn') notFound();
  const db = cms.kind === 'live' ? cms.page : null;
  const page = config;
  if (!page && !db) notFound();

  const title = db?.title || page?.title || '';
  const description = db?.metaDescription || page?.description || '';
  const pagePath = page?.path || `/info/${slug}/`;
  const showDraftNotice = !db && page != null && page.review !== 'approved';
  // Staff in draft preview see the draft layout; everyone else the published one.
  const appendageSlots = await resolveInfoPageTemplateSlots(slug, { draft: await isStaffDraftPreview() });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: title, path: pagePath }])} />
      <header className="mb-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">Publication policy</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{title}</h1>
        <p className="text-stone-600 mt-2">{description}</p>
      </header>

      {showDraftNotice && (
        <aside
          className="mb-8 p-4 border border-amber-300 bg-amber-50 rounded-sm text-sm text-amber-950"
          aria-label="Draft notice"
          data-legal-review="pending"
        >
          <strong className="block font-semibold">Draft — pending owner and legal review</strong>
          <p className="mt-1">This page describes how the site currently works. Its wording has not been finalized.</p>
          {page != null && page.ownerInputs.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Still to be confirmed:</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {page.ownerInputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </>
          )}
        </aside>
      )}

      {db?.hero && (
        <figure className="mb-8">
          {/*
            A plain <img>, deliberately. The URL is a resolved Media Library
            path captured at publication, and `alt` comes from the asset record
            rather than being retyped per page, so a correction made once in the
            Media Library is the one that reaches the next publication.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={db.hero.url}
            alt={db.hero.alt ?? ''}
            className="w-full rounded-sm border border-stone-200"
            loading="lazy"
            decoding="async"
          />
          {(db.hero.caption || db.hero.credit) && (
            <figcaption className="mt-2 text-[11px] text-stone-500">
              {db.hero.caption}
              {db.hero.caption && db.hero.credit ? ' · ' : ''}
              {db.hero.credit && <span className="italic">{db.hero.credit}</span>}
            </figcaption>
          )}
        </figure>
      )}

      {db ? (
        <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(db.body) }} />
      ) : page ? (
        <div className="space-y-8 text-stone-800 leading-relaxed">
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-serif text-xl font-bold text-stone-900 mb-2">{s.heading}</h2>
              {s.paragraphs.map((p, i) => <p key={i} className="mt-2">{p}</p>)}
            </section>
          ))}
        </div>
      ) : null}

      {/*
        Builder-owned presentation (PM-05), rendered after the page's own
        content. The CMS owns what the page says; the Builder owns what is
        arranged around it, and the two never write to each other's storage.
      */}
      <ArticleAppendageSlots slots={appendageSlots} />

      <nav aria-label="Publication policies" className="mt-12 pt-6 border-t border-stone-200">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_PAGES.filter((p) => p.slug !== slug).map((p) => (
            <li key={p.slug}><Link href={p.path} className="text-[#8B5E3C] hover:text-stone-900 underline-offset-2 hover:underline">{p.label}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
