/**
 * NFRGuide.com — Public Content Eligibility Policy & Access Boundary
 *
 * Enforces strict separation between editorial staging/draft workflows and
 * reader-facing public surfaces. Non-published articles (draft, in_review,
 * approved, scheduled, archived) MUST NEVER be discoverable or directly readable
 * on public reader routes.
 */

import { Article, ArticleWorkflowStatus } from '../types';

export interface EligibilityResult {
  isEligible: boolean;
  status: ArticleWorkflowStatus | 'draft' | 'published' | 'archived';
  reason?: string;
}

/**
 * Checks whether an article is currently eligible for public reader display.
 */
export function isArticlePubliclyEligible(
  article: Partial<Article> | null | undefined
): boolean {
  if (!article) return false;

  // If explicit workflowStatus exists, it must be 'published'
  if (article.workflowStatus) {
    return article.workflowStatus === 'published';
  }

  // Fallback to legacy status field
  return article.status === 'published';
}

/**
 * Detailed eligibility assessment with explanation for audit & UI notices.
 */
export function evaluateArticleEligibility(
  article: Partial<Article> | null | undefined
): EligibilityResult {
  if (!article) {
    return {
      isEligible: false,
      status: 'draft',
      reason: 'Article does not exist in editorial index.',
    };
  }

  const effectiveStatus = (article.workflowStatus || article.status || 'draft') as ArticleWorkflowStatus;

  switch (effectiveStatus) {
    case 'published':
      return {
        isEligible: true,
        status: 'published',
      };
    case 'draft':
      return {
        isEligible: false,
        status: 'draft',
        reason: 'This dispatch is in initial draft preparation.',
      };
    case 'in_review':
      return {
        isEligible: false,
        status: 'in_review',
        reason: 'This dispatch is currently under peer editorial review.',
      };
    case 'approved':
      return {
        isEligible: false,
        status: 'approved',
        reason: 'This dispatch has received editorial approval but has not been released.',
      };
    case 'scheduled':
      return {
        isEligible: false,
        status: 'scheduled',
        reason: 'This dispatch is scheduled for a future embargo release.',
      };
    case 'archived':
      return {
        isEligible: false,
        status: 'archived',
        reason: 'This dispatch has been decommissioned into the editorial archives.',
      };
    default:
      return {
        isEligible: false,
        status: effectiveStatus,
        reason: 'This dispatch is not cleared for public dissemination.',
      };
  }
}

/**
 * Pure filter function to enforce public visibility on any list of articles.
 */
export function filterPublicArticles<T extends Partial<Article>>(articles: T[]): T[] {
  if (!Array.isArray(articles)) return [];
  return articles.filter(isArticlePubliclyEligible);
}
