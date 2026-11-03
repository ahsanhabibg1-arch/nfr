'use client';

import React, { useEffect } from 'react';

interface AdminNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Notifications drawer. There is no notification or alerting system yet (no job runner,
 * no monitoring), so this shows an honest empty state instead of sample messages — it must
 * never imply that audits, sitemap checks or reminders ran (Batch A; Requirements §8.1).
 */
export const AdminNotificationPanel: React.FC<AdminNotificationPanelProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-2xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-notifications-title"
    >
      <div
        className="w-full max-w-sm h-full bg-white border-l border-stone-300 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <h3 id="admin-notifications-title" className="font-serif font-bold text-stone-900 text-sm">
            Notifications
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700"
            aria-label="Close notifications panel"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" data-testid="notifications-empty">
          <p className="text-sm font-semibold text-stone-800">No notifications</p>
          <p className="mt-1 text-xs text-stone-500 font-sans leading-relaxed">
            Notifications are not available yet. Review queues and SEO findings are shown in their
            own modules.
          </p>
        </div>
      </div>
    </div>
  );
};
