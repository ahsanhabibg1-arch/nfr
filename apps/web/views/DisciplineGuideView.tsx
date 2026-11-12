import React from 'react';
import Link from 'next/link';
import { getRodeoDisciplineBySlug, getPublishedArticlesByDiscipline, getAllDisciplines } from '../lib/content';
import { DisciplineGuideHeader } from '../components/editorial/DisciplineGuideHeader';
import { RelatedArticles } from '../components/editorial/RelatedArticles';
import { ROUTES } from '../config/routes';

// Async server component (Batch 02 §9). The route resolves the slug and handles
// 404 via notFound(); the discipline guide + related articles come from the DB.
export async function DisciplineGuideView({ slug }: { slug: string }) {
  const discipline = await getRodeoDisciplineBySlug(slug);
  const relatedArticles = discipline ? await getPublishedArticlesByDiscipline(slug) : [];

  if (!discipline) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">
          Discipline Not Found
        </h1>
        <p className="text-sm text-stone-600 font-sans mb-6">
          The requested discipline &ldquo;{slug}&rdquo; does not exist in the official NFR roster.
        </p>
        <Link
          href="/competition/"
          className="inline-flex px-5 py-2.5 bg-[#0F1115] text-[#D4A757] font-semibold text-xs uppercase tracking-wider rounded-sm"
        >
          View All Seven Disciplines
        </Link>
      </div>
    );
  }

  // Other disciplines for quick navigation
  const otherDisciplines = (await getAllDisciplines()).filter((d) => d.id !== discipline.id);

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-8 sm:py-12">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <DisciplineGuideHeader discipline={discipline} />

          {/* Section 1: Competition Format & Structure */}
          <section className="my-8 p-6 sm:p-8 bg-white border border-stone-200 rounded-sm">
            <h2 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">
              Championship Format
            </h2>
            <h3 className="text-xl font-serif font-bold text-[#0F1115] mb-3">
              How {discipline.name} Is Contested at the NFR
            </h3>
            <p className="text-sm sm:text-base text-stone-700 font-sans leading-relaxed">
              {discipline.competitionFormat || discipline.summary}
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-stone-200 text-xs font-sans">
              <div>
                <strong className="block text-stone-900 mb-1">Livestock Specification:</strong>
                <p className="text-stone-600 leading-normal">{discipline.stockProfile}</p>
              </div>
              <div>
                <strong className="block text-stone-900 mb-1">Arena Record &amp; Benchmark:</strong>
                <p className="text-stone-600 leading-normal">{discipline.historicBenchmark}</p>
              </div>
            </div>
          </section>

          {/*
            Section 2: Scoring & Timing Mechanics.

            CRASH FIX (Rodeo Coverage admin audit). `scoringBreakdown` and
            `rulesHighlights` were mapped unguarded, while `terminology` below
            was already guarded on length — so a discipline whose `guide` JSON is
            absent threw `Cannot read properties of undefined (reading 'map')`
            and took the whole `/disciplines/<slug>/` route down. It surfaced as
            a hard prerender failure that aborted `next build`.

            That state is now reachable by design: the new Add Discipline flow
            deliberately creates a discipline with `guide = null`, because
            evergreen guide copy is written by an editor and never invented at
            creation time. A newly added discipline must therefore render its
            header and summary and simply omit the sections it has no content
            for, rather than 500.
          */}
          {(discipline.scoringBreakdown?.length || discipline.rulesHighlights?.length) ? (
            <section className="my-8 p-6 sm:p-8 bg-white border border-stone-200 rounded-sm">
              <h2 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">
                Judicial Standards
              </h2>
              <h3 className="text-xl font-serif font-bold text-[#0F1115] mb-4">
                Scoring Criteria &amp; Timing Rules
              </h3>

              {discipline.scoringBreakdown && discipline.scoringBreakdown.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {discipline.scoringBreakdown.map((item, idx) => (
                    <div key={idx} className="p-4 bg-[#F7F3EA] border-l-2 border-[#D4A757] rounded-sm">
                      <h4 className="text-sm font-semibold text-stone-900 font-sans">{item.title}</h4>
                      <p className="text-xs text-stone-600 mt-1 font-sans leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {discipline.rulesHighlights && discipline.rulesHighlights.length > 0 && (
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans mb-3">
                    Key Regulations &amp; Disqualifications:
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-stone-700 font-sans list-none p-0 m-0">
                    {discipline.rulesHighlights.map((rule, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="text-[#8B5E3C] font-bold mt-0.5">&bull;</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}

          {/* Section 3: Essential Terminology */}
          {discipline.terminology && discipline.terminology.length > 0 && (
            <section className="my-8 p-6 sm:p-8 bg-white border border-stone-200 rounded-sm">
              <h2 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">
                Arena Vocabulary
              </h2>
              <h3 className="text-xl font-serif font-bold text-[#0F1115] mb-4">
                Essential Terms for {discipline.name}
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans text-xs">
                {discipline.terminology.map((t, idx) => (
                  <div key={idx} className="p-3 bg-[#F7F3EA]/70 border border-stone-200 rounded-sm">
                    <dt className="font-bold text-stone-900 text-sm mb-1">{t.term}</dt>
                    <dd className="text-stone-600 leading-normal">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Section 4: Beginner-Friendly Spectator Tips */}
          {discipline.beginnerTips && discipline.beginnerTips.length > 0 && (
            <section className="my-8 p-6 sm:p-8 bg-[#1E293B] text-white rounded-sm shadow-sm">
              <div className="text-xs uppercase tracking-widest font-sans font-bold text-[#D4A757] mb-2">
                Spectator Eye
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-3">
                What to Watch From the Stands
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-stone-300 font-sans list-none p-0 m-0">
                {discipline.beginnerTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="text-[#D4A757] font-bold mt-0.5">&bull;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Navigation to Other 6 Disciplines */}
          <section className="my-10 pt-8 border-t border-stone-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C]">
                Explore Other Championship Disciplines
              </h3>
              <Link href="/competition/" className="text-xs text-stone-600 hover:text-stone-950 font-semibold font-sans">
                View All &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {otherDisciplines.map((other) => (
                <Link
                  key={other.id}
                  href={ROUTES.DISCIPLINE(other.slug)}
                  className="p-3 bg-white border border-stone-200 hover:border-[#8B5E3C] text-center rounded-sm transition-colors group"
                >
                  <span className="text-[10px] uppercase font-mono text-ink-muted block mb-0.5">{other.category.split(' ')[0]}</span>
                  <span className="text-xs font-serif font-bold text-stone-900 group-hover:text-[#8B5E3C] block leading-tight">
                    {other.shortName}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Related Articles */}
          <RelatedArticles articles={relatedArticles} title={`Related ${discipline.name} Coverage`} />
        </div>
      </div>
    </div>
  );
}
