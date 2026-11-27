import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api } from '../../api/client';
import { AUTH_COPY, AuthLang, AuthTheme } from './authCopy';

// Google Identity Services, OAuth token flow. The page draws its own button (so it matches the
// form in light and dark mode) and Google's official popup handles the sign-in itself; the
// backend verifies the returned access token with Google before signing anyone in.

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

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
  /** Receives the Google OAuth access token. */
  onCredential: (accessToken: string) => void;
}

/** Renders nothing until backend/.env provides GOOGLE_CLIENT_ID. */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ lang, onCredential }) => {
  const t = AUTH_COPY[lang];
  const [clientId, setClientId] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const tokenClient = useRef<TokenClient | null>(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;

  useEffect(() => {
    let active = true;
    api<{ googleClientId: string }>('/auth/config')
      .then((config) => { if (active) setClientId(config.googleClientId); })
      .catch(() => { /* Password sign-in stays available without the config. */ });
    return () => { active = false; };
  }, []);

  // Prepare the token client ahead of time: the popup must open directly from the click.
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleScript().then(() => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!active || !oauth2) { if (active) setFailed(true); return; }
      tokenClient.current = oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (response) => {
          setWaiting(false);
          if (response.access_token) handler.current(response.access_token);
        },
        // Closing the popup is not an error worth showing.
        error_callback: () => setWaiting(false),
      });
      setReady(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div>
      <div className="auth-or"><span>{t.orContinue}</span></div>
      {failed ? (
        <p role="status" className="text-center text-xs text-slate-500">{t.googleFailed}</p>
      ) : (
        <button
          type="button"
          className="auth-social"
          disabled={!ready || waiting}
          onClick={() => { setWaiting(true); tokenClient.current?.requestAccessToken(); }}
        >
          {waiting
            ? <LoaderCircle className="auth-social-logo auth-spin-inline" aria-hidden="true" />
            : (
              <svg viewBox="0 0 48 48" className="auth-social-logo" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
            )}
          {t.continueWithGoogle}
        </button>
      )}
    </div>
  );
};
