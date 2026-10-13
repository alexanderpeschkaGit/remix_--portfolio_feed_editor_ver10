import { useEffect, useRef, useState } from 'react';

export interface StatusNoticeData {
  kind: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

export function useStatusNotice() {
  const [statusNotice, setStatusNotice] = useState<StatusNoticeData | null>(null);
  const statusNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (statusNoticeTimerRef.current) {
        window.clearTimeout(statusNoticeTimerRef.current);
      }
    };
  }, []);

  const pushStatusNotice = (
    kind: 'success' | 'info' | 'warning',
    title: string,
    message: string,
    timeoutMs = 3500
  ) => {
    if (statusNoticeTimerRef.current) {
      window.clearTimeout(statusNoticeTimerRef.current);
    }
    setStatusNotice({ kind, title, message });
    statusNoticeTimerRef.current = window.setTimeout(() => {
      setStatusNotice(null);
      statusNoticeTimerRef.current = null;
    }, timeoutMs);
  };

  const closeStatusNotice = () => {
    if (statusNoticeTimerRef.current) {
      window.clearTimeout(statusNoticeTimerRef.current);
      statusNoticeTimerRef.current = null;
    }
    setStatusNotice(null);
  };

  return { statusNotice, pushStatusNotice, closeStatusNotice };
}
