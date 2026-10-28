import { Article, ArticleRevision, ArticleWorkflowStatus } from '../types';
import { ALL_ARTICLES } from './mockEditorialData';

const STORAGE_KEY = 'nfrguide_demo_articles_v1';
const REVISIONS_STORAGE_KEY = 'nfrguide_demo_revisions_v1';

// Initial seed revisions for rich demonstration
const SEED_REVISIONS: Record<string, ArticleRevision[]> = {
  'hero-lead-01': [
    {
      id: 'rev-01-1',
      articleId: 'hero-lead-01',
      timestamp: 'October 25, 2026, 09:14 AM',
      actorName: 'Clayton Vance',
      actorRole: 'Senior Rodeo Correspondent',
      status: 'draft',
      summary: 'Initial draft import from newsroom dispatch with 4 roughstock interview transcripts.',
      snapshot: {
        title: 'Inside the Chutes: Roughstock Intensity',
        deck: 'Draft preview of chute gate mechanics and rider preparation.',
        status: 'draft',
      },
    },
    {
      id: 'rev-01-2',
      articleId: 'hero-lead-01',
      timestamp: 'October 26, 2026, 02:30 PM',
      actorName: 'Elena Morales',
      actorRole: 'Staff Editor',
      status: 'in_review',
      summary: 'Copy edit, verified scoring physics citations, and added 50/50 comparison table.',
      snapshot: {
        title: 'Inside the Chutes: Why the 8-Second Ride Remains Sport’s Purest Crucible',
        deck: 'Beyond the pyrotechnics and dirt-arena spectacle lies a calculated war of equine kinematics, judicial psychology, and survival.',
        status: 'in_review',
      },
    },
    {
      id: 'rev-01-3',
      articleId: 'hero-lead-01',
      timestamp: 'October 27, 2026, 08:00 AM',
      actorName: 'Devin Cole',
      actorRole: 'SEO Manager',
      status: 'approved',
      summary: 'Optimized SERP headline, verified PRCA rulebook link, and generated structured data.',
      snapshot: {
        title: 'Inside the Chutes: Why the 8-Second Ride Remains Sport’s Purest Crucible',
        deck: 'Beyond the pyrotechnics and dirt-arena spectacle lies a calculated war of equine kinematics, judicial psychology, and survival.',
        status: 'approved',
      },
    },
  ],
};

class ArticleStore {
  private articles: Article[] = [];
  private revisions: Record<string, ArticleRevision[]> = {};
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const storedArticles = typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null;
      const storedRevisions = typeof window !== 'undefined' ? window.sessionStorage.getItem(REVISIONS_STORAGE_KEY) : null;

      if (storedArticles) {
        this.articles = JSON.parse(storedArticles);
      } else {
        // Seed from mockEditorialData with enriched workflow properties
        this.articles = ALL_ARTICLES.map((art) => ({
          ...art,
          workflowStatus: (art.status || 'published') as ArticleWorkflowStatus,
          imageRightsStatus: 'Staff Photo',
          imageSeoTitle: `${art.title} — Featured Action Photography`,
          imageAltText: art.title ? `Editorial action photo illustrating ${art.title}` : 'Rodeo editorial photography',
          associatedDisciplineIds: art.associatedDisciplineId ? [art.associatedDisciplineId] : [],
          associatedHubIds: art.associatedHubId ? [art.associatedHubId] : ['las-vegas-nfr'],
          associatedEventIds: art.associatedEventId ? [art.associatedEventId] : ['nfr-championship'],
          associatedEditionIds: ['nfr-2026'],
        }));
      }

      if (storedRevisions) {
        this.revisions = JSON.parse(storedRevisions);
      } else {
        this.revisions = { ...SEED_REVISIONS };
      }
    } catch {
      this.articles = [...ALL_ARTICLES];
      this.revisions = { ...SEED_REVISIONS };
    }
  }

  private save() {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.articles));
        window.sessionStorage.setItem(REVISIONS_STORAGE_KEY, JSON.stringify(this.revisions));
      }
    } catch (e) {
      console.warn('SessionStorage unavailable, using memory store', e);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in article store listener', err);
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getAllArticles(): Article[] {
    return [...this.articles];
  }

  public getPublicArticles(): Article[] {
    return this.articles.filter((a) => {
      if (a.workflowStatus) return a.workflowStatus === 'published';
      return a.status === 'published';
    });
  }

  public getArticleById(id: string): Article | undefined {
    return this.articles.find((a) => a.id === id);
  }

  public getArticleBySlug(slug: string): Article | undefined {
    return this.articles.find((a) => a.slug === slug);
  }

  public getPublicArticleBySlug(slug: string): Article | undefined {
    const art = this.getArticleBySlug(slug);
    if (!art) return undefined;
    const isPub = art.workflowStatus ? art.workflowStatus === 'published' : art.status === 'published';
    return isPub ? art : undefined;
  }

  public saveArticle(
    article: Article,
    actorName: string = 'Current Editor',
    actorRole: string = 'Editor',
    changeSummary: string = 'Editorial update'
  ): Article {
    const existingIndex = this.articles.findIndex((a) => a.id === article.id);
    const now = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const updatedArticle: Article = {
      ...article,
      headline: article.title,
      updatedAt: now,
      status: article.workflowStatus || article.status || 'draft',
      workflowStatus: article.workflowStatus || (article.status as ArticleWorkflowStatus) || 'draft',
    };

    if (existingIndex >= 0) {
      this.articles[existingIndex] = updatedArticle;
    } else {
      this.articles.unshift(updatedArticle);
    }

    // Add revision entry
    const revId = `rev-${Date.now()}`;
    const newRevision: ArticleRevision = {
      id: revId,
      articleId: updatedArticle.id,
      timestamp: `${now}, ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      actorName,
      actorRole,
      status: updatedArticle.workflowStatus || 'draft',
      summary: changeSummary,
      snapshot: { ...updatedArticle },
    };

    if (!this.revisions[updatedArticle.id]) {
      this.revisions[updatedArticle.id] = [];
    }
    this.revisions[updatedArticle.id].unshift(newRevision);

    this.save();
    return updatedArticle;
  }

  public deleteArticle(id: string): boolean {
    const prevLen = this.articles.length;
    this.articles = this.articles.filter((a) => a.id !== id);
    if (this.articles.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getRevisions(articleId: string): ArticleRevision[] {
    return this.revisions[articleId] || [];
  }

  public restoreRevision(articleId: string, revisionId: string): Article | null {
    const revs = this.revisions[articleId] || [];
    const targetRev = revs.find((r) => r.id === revisionId);
    if (!targetRev || !targetRev.snapshot) return null;

    const existing = this.getArticleById(articleId);
    if (!existing) return null;

    const restored: Article = {
      ...existing,
      ...targetRev.snapshot,
      id: existing.id,
      slug: targetRev.snapshot.slug || existing.slug,
      title: targetRev.snapshot.title || existing.title,
      updatedAt: 'Restored just now',
    };

    return this.saveArticle(
      restored,
      'System Restore',
      'Administrator',
      `Restored revision from ${targetRev.timestamp}`
    );
  }

  public generateNextArticleId(): string {
    return `art-${Date.now().toString(36)}`;
  }
}

export const articleStore = new ArticleStore();
