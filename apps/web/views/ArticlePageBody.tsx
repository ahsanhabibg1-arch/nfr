import React from 'react';
import { ArticleView } from '@/views/ArticleView';
import { articleJsonLd, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { collectArticleFaqs } from '@/lib/content/articleFaq';
import { articleUrl } from '@/config/routes';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { ArticleMonetization } from '@/components/monetization/ArticleMonetization';
import { AdPlacementSlot } from '@/components/monetization/AdPlacementSlot';
import { CommentSection } from '@/components/editorial/CommentSection';
import { listApprovedForArticle } from '@/lib/cms/commentService';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { getArticleSchemaType } from '@/lib/cms/articleTypeRegistry';
import { articleCategoryCrumb } from '@/lib/seo/articleBreadcrumb';
import { getPublicSiteName } from '@/lib/cms/settingsService';
import type { Article } from '@/types';

/**
 * Everything an article page renders, extracted so the two routes that can
 * serve an article cannot drift apart.
 *
 * An article lives at `/<subcategory>/<slug>/` when it has a managed
 * subcategory and at `/articles/<slug>/` when it does not. Those are two route
 * files; this is one body. Copying it instead would mean every later change to
 * structured data, monetization, comments or the view beacon had to be made
 * twice, and the first one forgotten would be a page quietly missing its
 * disclosure banner or its analytics.
 */
export async function ArticlePageBody({ article }: { article: Article }) {
  /**
   * Batch 04-E — the structured-data classification comes from the managed
   * registry, resolved here because this is a Server Component and `lib/seo`
   * is synchronous and isomorphic. An unknown value, an uninitialised table or
   * an unreachable database all yield `'Article'`, never `'NewsArticle'`.
   */
  const schemaType = await getArticleSchemaType(article.articleType);
  const crumb = articleCategoryCrumb(article);
  // Stage 03 (H-06): resolved here because `lib/seo` is synchronous.
  const publisherName = await getPublicSiteName();
  const path = articleUrl(article);

  /**
   * The trail is Home → Section → [Subcategory] → Article.
   *
   * The subcategory step appears only when the article has one, and it is a
   * real linked step here because — unlike before the flat route existed — the
   * subcategory now HAS a URL. The visible breadcrumb in `ArticleHeader` shows
   * the same step, so markup and page agree.
   */
  const trail = [
    { name: 'Home', path: '/' },
    // Stage 03 (R-3): the SAME resolver the visible breadcrumb uses, so
    // the structured data and the rendered trail cannot diverge.
    { name: crumb.name, path: crumb.path },
    ...(article.subcategoryRef
      ? [{ name: article.subcategoryRef.name, path: `/${article.subcategoryRef.slug}/` }]
      : []),
    { name: article.title, path },
  ];

  /*
    FAQPage, BUILT FROM WHAT THE PAGE ACTUALLY SHOWS.

    `collectArticleFaqs` is the same call `ArticleBody` renders from, so the
    markup cannot describe a question the reader does not see — the line
    between accurate structured data and cloaking. It returns only COMPLETE
    pairs, so a half-written question reaches neither the page nor the markup.

    What this does not promise: a rich result. Google has limited FAQ rich
    results to authoritative government and health sites since 2023. The value
    is a correct machine-readable description of the content, and consistency
    with the category, discipline, competitor and event pages, which have
    emitted this since Batch 11.
  */
  const faqLd = faqPageJsonLd(collectArticleFaqs(article.structuredBody));

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd(article, { schemaType, publisherName }),
          breadcrumbJsonLd(trail),
          // Omitted entirely when the article has no complete question, which
          // is the same pattern the category and discipline pages use — an
          // empty FAQPage node is invalid markup, not a harmless one.
          ...(faqLd ? [faqLd] : []),
        ]}
      />
      <ArticleView article={article} draft={await isStaffDraftPreview()} />
      <ArticleMonetization articleId={article.id} />
      <AdPlacementSlot pageScope="article" />
      <CommentSection articleId={article.id} initialComments={await listApprovedForArticle(article.id)} />
      <ViewBeacon entityType="ARTICLE" entityId={article.id} path={path} />
    </>
  );
}
