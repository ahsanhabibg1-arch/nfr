/**
 * SEO Intelligence shared types (Batch 06). Plain module — safe to import from
 * analyzers, the orchestrator, the service and tests. Deterministic, explainable
 * findings; no black-box scores, no fabricated results.
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Kind = 'DEFECT' | 'RECOMMENDATION' | 'OPPORTUNITY' | 'NOT_PERFORMED';
export type Category =
  | 'content' | 'editorial' | 'technical' | 'structured_data'
  | 'internal_link' | 'rodeo_entity' | 'image';

/** Static rule metadata — the registry. Stable `code` identifies the rule forever. */
export interface SeoRuleDef {
  code: string;
  title: string;
  category: Category;
  severity: Severity;      // default severity (a finding may override within reason)
  kind: Kind;
  description: string;     // what the rule checks + why it matters (explainable)
  recommendation: string;  // default remediation guidance
}

/** A finding produced by an analyzer for one entity. */
export interface RawFinding {
  ruleCode: string;
  entityType: string;      // article | rodeo_event | rodeo_edition | rodeo_hub | discipline | venue | category | media | route | sitemap | structured_data
  entityId?: string | null;
  articleId?: string | null; // set when entityType === 'article' (keeps the FK)
  affectedUrl?: string | null;
  evidence: string;        // concrete evidence for the editor
  recommendation?: string; // overrides the rule default when present
  severity?: Severity;     // overrides the rule default when present
  kind?: Kind;
  detail?: Record<string, unknown>;
  discriminator?: string;  // extra fingerprint component (e.g. the duplicate value)
}

export interface AuditScope {
  kind: 'full' | 'article' | 'rodeo' | 'technical';
  articleId?: string;       // for a single-article audit
}
