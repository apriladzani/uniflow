import React from 'react';
import { AuthLang } from './authCopy';

// Inline SVG flags: emoji flags do not render on Windows.
export const LanguageFlag: React.FC<{ lang: AuthLang; className?: string }> = ({ lang, className }) => (
  lang === 'id' ? (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="30" height="10" fill="#E70011" />
      <rect y="10" width="30" height="10" fill="#FFFFFF" />
    </svg>
  ) : (
    <svg viewBox="0 0 60 30" className={className} aria-hidden="true" preserveAspectRatio="none">
      <clipPath id="uk-flag-clip"><path d="M0 0v30h60V0z" /></clipPath>
      <clipPath id="uk-flag-diagonals"><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
      <g clipPath="url(#uk-flag-clip)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath="url(#uk-flag-diagonals)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
);
