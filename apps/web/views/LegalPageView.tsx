import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_PAGES, getLegalPage } from '../config/legalPages';
import { getPublishedInfoPage } from '../lib/cms/infoPageService';
import { sanitizeLegalHtml } from '../lib/cms/sanitizeHtml';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '../lib/seo';

export async function legalPageMetadata(slug: string): Promise<Metadata> {
  const page = getLegalPage(slug);
  if (!page) return {};
  const db = await getPublishedInfoPage(slug);
  return buildMetadata({
    title: db?.seoTitle || db?.title || page.title,
    description: db?.metaDescription || page.description,
    path: page.path,
    noindex: !db && page.review !== 'approved',
  });
}

export async function LegalPageView({ slug }: { slug: string }) {
  const page = getLegalPage(slug);
  if (!page) notFound();
  const db = await getPublishedInfoPage(slug);

  const title = db?.title || page.title;
  const description = db?.metaDescription || page.description;
  const showDraftNotice = !db && page.review !== 'approved';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: title, path: page.path }])} />
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
          {page.ownerInputs.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Still to be confirmed:</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {page.ownerInputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </>
          )}
        </aside>
      )}

      {db ? (
        <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(db.body) }} />
      ) : (
        <div className="space-y-8 text-stone-800 leading-relaxed">
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-serif text-xl font-bold text-stone-900 mb-2">{s.heading}</h2>
              {s.paragraphs.map((p, i) => <p key={i} className="mt-2">{p}</p>)}
            </section>
          ))}
        </div>
      )}

      <nav aria-label="Publication policies" className="mt-12 pt-6 border-t border-stone-200">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
            <li key={p.slug}><Link href={p.path} className="text-[#8B5E3C] hover:text-stone-900 underline-offset-2 hover:underline">{p.label}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
