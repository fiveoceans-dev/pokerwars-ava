import { useEffect } from 'react';

/**
 * Custom hook to restore scroll position on page refresh
 * Uses sessionStorage to persist scroll position
 */
export function useScrollRestoration(key: string = 'scrollPosition') {
  useEffect(() => {
    // Restore scroll position on mount
    const savedPosition = sessionStorage.getItem(key);
    if (savedPosition) {
      const position = parseInt(savedPosition, 10);
      if (!isNaN(position)) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          window.scrollTo(0, position);
        });
      }
    }

    // Debounce function for scroll events
    let timeoutId: NodeJS.Timeout;
    const debounce = (func: () => void, delay: number) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(func, delay);
    };

    // Save scroll position on scroll (debounced)
    const handleScroll = () => {
      debounce(() => {
        sessionStorage.setItem(key, window.scrollY.toString());
      }, 100);
    };

    // Save scroll position before unload
    const handleBeforeUnload = () => {
      sessionStorage.setItem(key, window.scrollY.toString());
    };

    // Add event listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearTimeout(timeoutId);
    };
  }, [key]);
}

export default useScrollRestoration;