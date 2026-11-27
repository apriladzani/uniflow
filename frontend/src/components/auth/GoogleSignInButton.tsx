import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AUTH_COPY, AuthLang, AuthTheme } from './authCopy';

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
  theme?: AuthTheme;
  onCredential: (credential: string) => void;
}

/** Renders nothing until backend/.env provides GOOGLE_CLIENT_ID. */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ mode, lang, theme = 'light', onCredential }) => {
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
        theme: theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        locale: lang, // Follow the page's EN/ID switch instead of the browser language.
        // A few px wider than the frame so Google's own side borders fall outside the clip.
        width: Math.min((containerRef.current.parentElement?.clientWidth || 396) + 4, 400), // Google caps the width at 400px.
      });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [clientId, mode, lang, theme]);

  if (!clientId) return null;
  const t = AUTH_COPY[lang];
  return (
    <div>
      <div className="auth-or"><span>{t.orContinue}</span></div>
      {failed
        ? <p role="status" className="text-center text-xs text-slate-500">{t.googleFailed}</p>
        : (
          // Google's button cannot take a custom corner radius. Its real button stays visible
          // (Google refuses clicks on hidden buttons); this frame clips its own square corners and
          // border and draws ours instead, so it matches the other form buttons.
          <div className="auth-social">
            <div ref={containerRef} className="auth-social-google" />
          </div>
        )}
    </div>
  );
};
