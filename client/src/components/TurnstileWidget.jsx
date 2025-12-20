import React, { useEffect, useRef } from 'react';

function TurnstileWidget({ siteKey, onToken, theme = 'auto' }) {
  const ref = useRef(null);

  useEffect(() => {
    const render = () => {
      if (window.turnstile && ref.current) {
        window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onToken && onToken(token),
        });
      }
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
      if (ref.current && window.turnstile) {
        try {
          window.turnstile.reset(ref.current);
        } catch (_) {}
      }
    };
  }, [siteKey, theme, onToken]);

  return <div ref={ref} className="cf-turnstile" />;
}

export default TurnstileWidget;
