/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { SectionLandingPage } from './pages/SectionLandingPage';
import { DisciplineGuidePage } from './pages/DisciplineGuidePage';
import { CategoryArchivePage } from './pages/CategoryArchivePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Admin CMS Shell & Pages
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminArticlesPage } from './pages/admin/AdminArticlesPage';
import { AdminArticleEditorShell } from './pages/admin/AdminArticleEditorShell';
import { AdminRodeoCoveragePage } from './pages/admin/AdminRodeoCoveragePage';
import { AdminEditorialOrgPage } from './pages/admin/AdminEditorialOrgPage';
import { AdminMediaPage } from './pages/admin/AdminMediaPage';
import { AdminSourcesPage } from './pages/admin/AdminSourcesPage';
import { AdminSEOPage } from './pages/admin/AdminSEOPage';
import { AdminWebsitePage } from './pages/admin/AdminWebsitePage';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { AdminMonetizationPage } from './pages/admin/AdminMonetizationPage';
import { AdminTeamPage } from './pages/admin/AdminTeamPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin Editorial CMS Application Shell */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="articles" element={<AdminArticlesPage />} />
          <Route path="articles/new" element={<AdminArticleEditorShell />} />
          <Route path="articles/:id/edit" element={<AdminArticleEditorShell />} />
          <Route path="rodeo-coverage" element={<AdminRodeoCoveragePage />} />
          <Route path="editorial-organization" element={<AdminEditorialOrgPage />} />
          <Route path="media" element={<AdminMediaPage />} />
          <Route path="sources" element={<AdminSourcesPage />} />
          <Route path="seo" element={<AdminSEOPage />} />
          <Route path="website" element={<AdminWebsitePage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="monetization" element={<AdminMonetizationPage />} />
          <Route path="team" element={<AdminTeamPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        {/* Public Editorial Website Shell */}
        <Route element={<Layout />}>
          {/* Homepage */}
          <Route path="/" element={<HomePage />} />

          {/* Dedicated Article Detail */}
          <Route path="/articles/:slug" element={<ArticleDetailPage />} />
          <Route path="/articles/:slug/" element={<ArticleDetailPage />} />

          {/* Five Primary Section Landing Pages */}
          <Route path="/competition" element={<SectionLandingPage />} />
          <Route path="/competition/" element={<SectionLandingPage />} />
          <Route path="/entertainment" element={<SectionLandingPage />} />
          <Route path="/entertainment/" element={<SectionLandingPage />} />
          <Route path="/events-shopping" element={<SectionLandingPage />} />
          <Route path="/events-shopping/" element={<SectionLandingPage />} />
          <Route path="/plan-watch" element={<SectionLandingPage />} />
          <Route path="/plan-watch/" element={<SectionLandingPage />} />
          <Route path="/rodeo-events" element={<SectionLandingPage />} />
          <Route path="/rodeo-events/" element={<SectionLandingPage />} />

          {/* Legacy / Alternate Section Route Compatibility Redirects */}
          <Route path="/nfr-competition" element={<Navigate to="/competition/" replace />} />
          <Route path="/nfr-competition/*" element={<Navigate to="/competition/" replace />} />
          <Route path="/nfr-entertainment" element={<Navigate to="/entertainment/" replace />} />
          <Route path="/nfr-entertainment/*" element={<Navigate to="/entertainment/" replace />} />
          <Route path="/nfr-events-and-shopping" element={<Navigate to="/events-shopping/" replace />} />
          <Route path="/nfr-events-and-shopping/*" element={<Navigate to="/events-shopping/" replace />} />
          <Route path="/nfr-plan-and-watch" element={<Navigate to="/plan-watch/" replace />} />
          <Route path="/nfr-plan-and-watch/*" element={<Navigate to="/plan-watch/" replace />} />
          <Route path="/more-rodeo" element={<Navigate to="/rodeo-events/" replace />} />
          <Route path="/more-rodeo/*" element={<Navigate to="/rodeo-events/" replace />} />

          {/* Discipline Guide Template */}
          <Route path="/disciplines/:slug" element={<DisciplineGuidePage />} />
          <Route path="/disciplines/:slug/" element={<DisciplineGuidePage />} />

          {/* Category & Archive Pages */}
          <Route path="/categories/:slug" element={<CategoryArchivePage />} />
          <Route path="/categories/:slug/" element={<CategoryArchivePage />} />

          {/* 404 Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
