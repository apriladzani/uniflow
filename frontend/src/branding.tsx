import React, { useSyncExternalStore } from 'react';
import { Clapperboard } from 'lucide-react';
import { api, apiUrl } from './api/client';

// Platform branding (custom logo and favicon) set by platform admins.
// Served by the API; empty URLs mean "use the built-in default".

export interface Branding { logoUrl: string; faviconUrl: string }

let branding: Branding = { logoUrl: '', faviconUrl: '' };
const listeners = new Set<() => void>();

/** Converts an API-relative path ("/api/branding/logo?v=1") to a URL that honours VITE_API_BASE_URL. */
const resolve = (url: string) => (url ? apiUrl(url.replace(/^\/api/, '')) : '');

function applyFavicon(url: string) {
  let links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (!links.length) {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    links = [link];
  }
  // "data:," is an empty icon, so removing a custom favicon does not leave a stale one.
  links.forEach((link) => { link.href = url || 'data:,'; });
}

export function setBranding(next: Branding) {
  branding = { logoUrl: resolve(next.logoUrl), faviconUrl: resolve(next.faviconUrl) };
  applyFavicon(branding.faviconUrl);
  listeners.forEach((listener) => listener());
}

export async function loadBranding() {
  try { setBranding(await api<Branding>('/branding')); } catch { /* Keep the built-in logo and no favicon. */ }
}

export function useBranding(): Branding {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => branding,
  );
}

/** The app logo: the admin-uploaded image when set, otherwise the yellow clapperboard mark. */
export const BrandLogo: React.FC<{ className: string; iconClassName: string; strokeWidth?: number }> = ({ className, iconClassName, strokeWidth }) => {
  const { logoUrl } = useBranding();
  if (logoUrl) return <img src={logoUrl} alt="Logo" className={`${className} object-contain`} />;
  return <div className={`${className} bg-[#F5C518] text-[#111827] flex items-center justify-center`}><Clapperboard className={iconClassName} strokeWidth={strokeWidth} /></div>;
};
