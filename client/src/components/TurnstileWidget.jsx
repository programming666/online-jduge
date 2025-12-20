import React, { useEffect, useRef } from 'react';

function TurnstileWidget({ siteKey, onToken, theme = 'auto' }) {
  const ref = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    const render = () => {
      if (!window.turnstile || !ref.current) return;
      let resolved = '';
      if (typeof siteKey === 'string') {
        resolved = siteKey.trim();
      } else if (siteKey && typeof siteKey === 'object') {
        if (typeof siteKey.siteKey === 'string') resolved = siteKey.siteKey.trim();
        else if (typeof siteKey.value === 'string') resolved = siteKey.value.trim();
      }
      if (!resolved) return;
      try {
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: resolved,
          theme,
          callback: (token) => onToken && onToken(token),
        });
      } catch (_) {}
    };

    if (!window.turnstile) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.onload = render;
      document.body.appendChild(s);
    } else {
      render();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (_) {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, onToken]);

  return <div ref={ref} className="cf-turnstile" />;
}

export default TurnstileWidget;
