import { useState, useEffect } from 'react';

// True when the viewport is phone/tablet width. Drives the collapsing sidebar
// and stacked layouts so the same web app works inside the Capacitor shell.
export default function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => (mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange));
  }, [query]);

  return isMobile;
}
