'use client';

import React from 'react';

/**
 * Whether the page is being rendered inside the Page Builder canvas
 * (Stage 06 Task 4).
 *
 * WHY A CONTEXT RATHER THAN A PROP
 *
 * `PageRenderer` is reached through five different view components, which are
 * in turn reached from eleven public routes. Threading an `editorMode` prop
 * through all of them would mean editing every public page and would silently
 * lose the flag on any route a later stage adds — the failure mode being an
 * un-selectable block with no error, which is exactly the class of defect this
 * programme exists to remove.
 *
 * Instead the flag is established ONCE, server-side, in `app/(public)/layout.tsx`,
 * from `isStaffDraftPreview()`. That helper requires both Next.js draft mode and
 * the `system.config` permission, so:
 *
 *   - a public visitor is never in editor mode;
 *   - every public route inherits the flag without being modified;
 *   - the default is `false`, so a route that forgets the provider degrades to
 *     ordinary public rendering rather than to leaked editor markup.
 *
 * The context carries a boolean only. It grants no capability and reads no data.
 */
const BuilderEditorModeContext = React.createContext<boolean>(false);

export function BuilderEditorModeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <BuilderEditorModeContext.Provider value={enabled}>{children}</BuilderEditorModeContext.Provider>;
}

/** False unless a provider above has explicitly enabled editor mode. */
export function useBuilderEditorMode(): boolean {
  return React.useContext(BuilderEditorModeContext);
}

export { BuilderEditorModeContext };
