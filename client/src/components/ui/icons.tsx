import React from 'react';

export const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a1.558 1.558 0 0 1 .6966 1.2331v4.5942a4.4992 4.4992 0 0 1-5.1531 4.3017zM4.0542 14.8903a4.4648 4.4648 0 0 1-1.2881-3.233D4.5 4.5 0 0 1 3.2 10.7456l.142.0805 4.7783 2.7582a.7948.7948 0 0 0 .7854 0l5.8353-3.3685v2.3324a1.558 1.558 0 0 1-.3142 1.0118l-3.9782 6.8901a4.4992 4.4992 0 0 1-6.3944-5.5598zm4.185-5.365a4.453 4.453 0 0 1 2.5427-1.6184l-.142.0805-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369l-2.02-1.1686a1.558 1.558 0 0 1-.6966-1.2331V10.749a4.4992 4.4992 0 0 1 5.487-1.2238zm12.32 2.2224a4.485 4.485 0 0 1 1.2881 3.233 4.5 4.5 0 0 1-.4338 1.9115l-.142-.0804-4.7783-2.7582a.7948.7948 0 0 0-.7854 0L9.8725 17.422v-2.3324a1.558 1.558 0 0 1 .3142-1.0118l3.9782-6.8901a4.4992 4.4992 0 0 1 6.3944 5.5645zm-4.185 5.365a4.453 4.453 0 0 1-2.5427 1.6184l.142-.0805 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a1.558 1.558 0 0 1 .6966 1.2331v4.5942a4.4992 4.4992 0 0 1-5.487 1.2427zM5.7181 5.8617a4.4755 4.4755 0 0 1 2.8764 1.0408l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369l-2.02-1.1686a1.558 1.558 0 0 1-.6966-1.2331V9.7545a4.4992 4.4992 0 0 1 5.1531-3.8928z"/>
  </svg>
);

export const ClaudeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Asterisk/Spark shape for Claude */}
    <path d="M11 1L11 9L5 4L4 5L9 11L1 11L1 13L9 13L4 19L5 20L11 15L11 23L13 23L13 15L19 20L20 19L15 13L23 13L23 11L15 11L20 5L19 4L13 9L13 1L11 1Z" />
  </svg>
);

export const GrokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Stylized slash/G shape for Grok */}
    <path d="M20.5 3.5L3.5 20.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

export const GeminiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
     {/* 4-pointed star shape for Gemini */}
     <path d="M12 2C12 7.52285 16.4772 12 22 12C16.4772 12 12 16.4772 12 22C12 16.4772 7.52285 12 2 12C7.52285 12 12 7.52285 12 2Z" />
  </svg>
);

export const DeepSeekIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Whale shape for DeepSeek */}
    <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" opacity="0.2"/>
    <path d="M18 8C18 8 16 9 16 11C16 13 18 14 18 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 16C12 16 9 16 7 14C5 12 5 9 5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
