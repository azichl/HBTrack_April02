import { useEffect, useRef } from 'react';

interface UseIdleTimeoutOptions {
  onIdle: () => void;
  idleTimeMs?: number; // Default: 30 minutes
}

export const useIdleTimeout = ({ onIdle, idleTimeMs = 30 * 60 * 1000 }: UseIdleTimeoutOptions) => {
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  const handleActivity = () => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }
    // Set a new timeout
    timeoutId.current = setTimeout(() => {
      onIdle();
    }, idleTimeMs);
  };

  useEffect(() => {
    // List of events that indicate user activity
    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ];

    // Initial setup
    handleActivity();

    // Add listeners
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [onIdle, idleTimeMs]);
};
