import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AUTH_COPY, AuthLang } from './authCopy';

type GoogleIdentity = {
  initialize: (config: { client_id: string; callback: (result: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
};

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}

let scriptPromise: Promise<void> | null = null;
let initializedClientId = '';
let credentialHandler: (credential: string) => void = () => {};

function loadGoogleScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error('Google script failed to load')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface GoogleSignInButtonProps {
  mode: 'signin' | 'signup';
  lang: AuthLang;
  onCredential: (credential: string) => void;
}

/** Renders nothing until backend/.env provides GOOGLE_CLIENT_ID. */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ mode, lang, onCredential }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => { credentialHandler = onCredential; }, [onCredential]);

  useEffect(() => {
    let active = true;
    api<{ googleClientId: string }>('/auth/config')
      .then((config) => { if (active) setClientId(config.googleClientId); })
      .catch(() => { /* Password sign-in stays available without the config. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleScript().then(() => {
      const identity = window.google?.accounts.id;
      if (!active || !identity || !containerRef.current) return;
      if (initializedClientId !== clientId) {
        identity.initialize({ client_id: clientId, callback: (result) => credentialHandler(result.credential) });
        initializedClientId = clientId;
      }
      containerRef.current.replaceChildren();
      identity.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: mode === 'signin' ? 'signin_with' : 'signup_with',
        locale: lang, // Follow the page's EN/ID switch instead of the browser language.
        width: Math.min(containerRef.current.clientWidth || 400, 400), // Google caps the width at 400px.
      });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [clientId, mode, lang]);

  if (!clientId) return null;
  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-3"><div className="h-px flex-1 bg-slate-100" /><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{AUTH_COPY[lang].or}</span><div className="h-px flex-1 bg-slate-100" /></div>
      {failed
        ? <p role="status" className="text-center text-xs text-slate-500">{AUTH_COPY[lang].googleFailed}</p>
        : <div ref={containerRef} className="flex min-h-10 w-full justify-center" />}
    </div>
  );
};
