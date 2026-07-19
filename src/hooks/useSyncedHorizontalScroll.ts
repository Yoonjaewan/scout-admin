import { useCallback, useEffect, useRef, useState } from "react";
import type { UIEvent } from "react";

/**
 * 목록 상·하단 가로 스크롤 동기화.
 * overflow가 있을 때만 상단 스크롤바를 표시한다.
 */
export function useSyncedHorizontalScroll(...deps: unknown[]) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const syncLockRef = useRef(false);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);

  const updateOverflow = useCallback(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    if (!bottom) {
      setShowTopScrollbar(false);
      return;
    }

    const hasOverflow = bottom.scrollWidth > bottom.clientWidth + 1;
    setShowTopScrollbar(hasOverflow);

    const topInner = top?.firstElementChild as HTMLDivElement | null;
    if (topInner) {
      topInner.style.width = `${bottom.scrollWidth}px`;
    }

    if (top && !syncLockRef.current) {
      top.scrollLeft = bottom.scrollLeft;
    }
  }, []);

  const handleTopScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (syncLockRef.current) return;
    const bottom = bottomRef.current;
    if (!bottom) return;

    syncLockRef.current = true;
    bottom.scrollLeft = event.currentTarget.scrollLeft;
    syncLockRef.current = false;
  }, []);

  const handleBottomScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (syncLockRef.current) return;
    const top = topRef.current;
    if (!top) return;

    syncLockRef.current = true;
    top.scrollLeft = event.currentTarget.scrollLeft;
    syncLockRef.current = false;
  }, []);

  useEffect(() => {
    updateOverflow();

    const bottom = bottomRef.current;
    if (!bottom) return;

    const resizeObserver = new ResizeObserver(() => {
      updateOverflow();
    });
    resizeObserver.observe(bottom);
    window.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
    // Caller passes primitive layout deps (counts, flags) so overflow is recalculated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateOverflow, ...deps]);

  useEffect(() => {
    if (!showTopScrollbar) return;
    updateOverflow();
  }, [showTopScrollbar, updateOverflow]);

  return {
    topRef,
    bottomRef,
    showTopScrollbar,
    handleTopScroll,
    handleBottomScroll,
    updateOverflow,
  };
}