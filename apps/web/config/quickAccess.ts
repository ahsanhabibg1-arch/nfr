import type { QuickLinkItem } from '../types';
import { ROUTES } from './routes';

/**
 * NFR quick-access row (Requirements v2.0 §3.1: schedules, results, disciplines, how to
 * watch, tickets). Pure navigation to section pages — no counts, dates, badges or claims
 * about content that may not be published yet.
 */
export const QUICK_ACCESS_LINKS: QuickLinkItem[] = [
  { id: 'qa-schedule', title: 'Schedules', description: 'NFR schedule coverage in the Competition section.', category: 'Competition', targetSectionId: 'competition', targetRoute: ROUTES.COMPETITION },
  { id: 'qa-results', title: 'Results & Standings', description: 'Editorial results and standings coverage.', category: 'Competition', targetSectionId: 'competition', targetRoute: ROUTES.COMPETITION },
  { id: 'qa-disciplines', title: 'Disciplines', description: 'Guides to the seven NFR disciplines.', category: 'Competition', targetSectionId: 'competition', targetRoute: ROUTES.COMPETITION },
  { id: 'qa-watch', title: 'How to Watch', description: 'Information on authorized TV and streaming options.', category: 'Plan & Watch', targetSectionId: 'plan-watch', targetRoute: ROUTES.PLAN_WATCH },
  { id: 'qa-tickets', title: 'Tickets', description: 'Ticket guidance. Buy only from official or authorized sellers.', category: 'Plan & Watch', targetSectionId: 'plan-watch', targetRoute: ROUTES.PLAN_WATCH },
];
