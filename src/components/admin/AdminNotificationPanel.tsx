import React, { useEffect } from 'react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'warning' | 'success';
}

interface AdminNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Automated 12-Group SEO Audit Completed',
    message: 'Scheduled check completed across 18 public pages. 1 critical commercial link finding detected.',
    timestamp: '1 hour ago',
    type: 'warning',
  },
  {
    id: 'notif-2',
    title: 'New Editorial Article Draft Saved',
    message: 'Clayton Vance saved structured body draft for "Inside the Chutes".',
    timestamp: '2 hours ago',
    type: 'info',
  },
  {
    id: 'notif-3',
    title: 'XML Sitemap Generated',
    message: '24 public URLs successfully verified for production sitemap staging.',
    timestamp: 'Today at 00:01 AM',
    type: 'success',
  },
  {
    id: 'notif-4',
    title: '2026 Event Edition Reminder',
    message: 'July dates for 2026 Calgary Stampede need final purse confirmation.',
    timestamp: 'Yesterday',
    type: 'info',
  },
];

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
    >
      <div
        className="w-full max-w-sm h-full bg-white border-l border-stone-300 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-bold text-stone-900 text-sm">
              Editorial Notifications
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-[#D4A757]/20 text-[#8B5E3C] font-semibold">
              {SAMPLE_NOTIFICATIONS.length} New
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700"
            aria-label="Close notifications panel"
          >
            &times;
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 p-2">
          {SAMPLE_NOTIFICATIONS.map((notif) => {
            const badgeColor = {
              warning: 'bg-amber-500',
              success: 'bg-emerald-500',
              info: 'bg-blue-500',
            }[notif.type];

            return (
              <div key={notif.id} className="p-3 hover:bg-stone-50 transition-colors">
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${badgeColor}`} aria-hidden="true" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-stone-900">{notif.title}</h4>
                    <p className="text-[11px] text-stone-600 font-sans mt-0.5 leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] font-mono text-stone-400 mt-1.5 block">{notif.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 text-center text-xs text-stone-500 font-sans">
          Phase 0 Mock Review Queue Notifications
        </div>
      </div>
    </div>
  );
};
