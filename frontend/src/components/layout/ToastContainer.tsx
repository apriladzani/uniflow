import React from 'react';
import { useCMS } from '../../context/CMSContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useCMS();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2 sm:px-0">
      {toasts.map((toast) => {
        let Icon = Info;
        let borderClass = 'border-blue-500/30';
        let iconColor = 'text-blue-500';

        if (toast.type === 'success') {
          Icon = CheckCircle2;
          borderClass = 'border-emerald-500/30';
          iconColor = 'text-emerald-500';
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          borderClass = 'border-rose-500/30';
          iconColor = 'text-rose-500';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          borderClass = 'border-amber-500/30';
          iconColor = 'text-amber-500';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-white text-slate-800 rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.12)] border ${borderClass} animate-in fade-in slide-in-from-bottom-2 duration-200`}
          >
            <Icon className={`w-5 h-5 shrink-0 ${iconColor} mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-slate-900">{toast.title}</h4>
              {toast.message && (
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
