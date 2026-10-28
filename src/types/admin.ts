/**
 * NFRGuide Custom Editorial CMS — Admin Data Contracts & Interfaces
 * Phase 0 Prompt 03 Foundation
 */

export type AdminRole = 'Super Admin' | 'Administrator' | 'Editor' | 'Author' | 'SEO Manager';

export type ArticleAdminStatus = 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar?: string;
  status: 'active' | 'invited' | 'suspended';
  lastActive: string;
  articlesCount: number;
}

export interface AdminActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: 'article' | 'media' | 'event' | 'seo' | 'user' | 'settings';
  entityTitle: string;
  timestamp: string;
  status: 'success' | 'warning' | 'info';
}

export type SEOGroup = 
  | 'On-page'
  | 'Search Appearance'
  | 'Technical'
  | 'Content & Topic'
  | 'External Links'
  | 'Internal Links'
  | 'Image SEO'
  | 'Structured Data'
  | 'AI Search Readiness'
  | 'Freshness'
  | 'Event SEO'
  | 'Redirects';

export type IssueSeverity = 'critical' | 'warning' | 'notice' | 'passed';

export interface SEOIssue {
  id: string;
  group: SEOGroup;
  rule: string;
  severity: IssueSeverity;
  status: 'open' | 'in_progress' | 'resolved' | 'ignored';
  affectedContent: string;
  evidence: string;
  suggestedResolution: string;
  lastChecked: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  dimensions: string;
  size: string;
  format: 'jpg' | 'png' | 'webp';
  seoTitle: string;
  altText: string;
  credit: string;
  rightsStatus: 'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative';
  uploadedAt: string;
  usedInCount: number;
}

export interface AdminSourceItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  type: 'Rulebook' | 'Judicial Handbook' | 'Official Archive' | 'Historical Dataset' | 'Sanctioning Body';
  classification: 'Official' | 'Independent Reference' | 'Historical Archive';
  verificationDate: string;
  linkedArticleCount: number;
  status: 'verified' | 'needs_review' | 'expired';
}

export interface SearchQueryLog {
  query: string;
  impressions: number;
  clicks: number;
  resultsCount: number;
  hasZeroResults: boolean;
  lastSearched: string;
}

export interface AffiliatePartner {
  id: string;
  name: string;
  category: 'Lodging' | 'Ticketing' | 'Western Apparel' | 'Equipment & Tack';
  status: 'Active' | 'Pending Review' | 'Paused';
  activeLinksCount: number;
  disclosureTag: string;
  relAttribute: string; // 'sponsored' or 'nofollow sponsored'
  commissionModel: string;
}

export interface CommercialLink {
  id: string;
  anchorText: string;
  targetUrl: string;
  partnerName: string;
  articleSlug: string;
  articleTitle: string;
  rel: string;
  status: 'active' | 'flagged';
  lastAudited: string;
}

export interface HomepageSectionConfig {
  id: string;
  sectionCode: string; // 'section_a', 'section_b', etc.
  name: string;
  order: number;
  isVisible: boolean;
  mode: 'Manual Curation' | 'Automatic Feed' | 'Hybrid Dynamic';
  featuredArticleId?: string;
  lastUpdated: string;
}

export interface BackgroundJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  duration: string;
  itemsProcessed: number;
}
