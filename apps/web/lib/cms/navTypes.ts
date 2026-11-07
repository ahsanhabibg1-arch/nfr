/**
 * Shared navigation types (Batch 04 §F). Plain module — no `server-only` — so
 * both the server navigationService and the client header/footer can import it.
 */
export interface NavLink {
  label: string;
  url: string;
  isExternal: boolean;
}

export const NAV_LOCATIONS = ['header', 'footer-sections', 'footer-academy', 'quick-access'] as const;
export type NavLocation = (typeof NAV_LOCATIONS)[number];

export interface QuickAccessLink {
  id: string;
  label: string;
  url: string;
  description: string;
  sortOrder: number;
  isExternal: boolean;
}

export interface PublicNavigation {
  header: NavLink[];
  footerSections: NavLink[];
  footerAcademy: NavLink[];
}
