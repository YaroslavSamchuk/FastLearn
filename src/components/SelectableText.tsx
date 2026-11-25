// language: TypeScript (React), file: src/components/SelectableText.tsx, target: Web / Mobile Browser
import React, { useEffect, useMemo, useRef } from 'react';
import { tokenizeMessage } from '../utils/textTokens.ts';
import { useWordSelection } from '../context/SelectionContext.tsx';

interface SelectableTextProps {
  text: string;
  messageId: string;
  isStreaming?: boolean;
}

export const SelectableText: React.FC<SelectableTextProps> = ({
  text,
  messageId,
  isStreaming = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    tokenIndex: number;
    pointerId: number;
    tokenElement: HTMLElement;
    dragStarted: boolean;
    cancelledByScroll: boolean;
    timer?: number;
  } | null>(null);

  const tokens = useMemo(() => tokenizeMessage(text), [text]);

  const {
    activeMessageId,
    selectedRange,
    startWordDrag,
    selectSingleWord,
    updateWordDrag,
    isDragging
  } = useWordSelection();

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      if (touchStateRef.current?.dragStarted && event.cancelable) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', handleTouchMove);
  }, []);

  const isCurrentMessage = activeMessageId === messageId;
  const minSelected = selectedRange ? Math.min(selectedRange.start, selectedRange.end) : -1;
  const maxSelected = selectedRange ? Math.max(selectedRange.start, selectedRange.end) : -1;

  const handlePointerDown = (e: React.PointerEvent, tokenIndex: number) => {
    if (isStreaming) return;
    if (e.button !== 0) return;

    const container = containerRef.current;
    if (!container) return;

    if (e.pointerType === 'touch') {
      const tokenElement = e.currentTarget;
      if (!(tokenElement instanceof HTMLElement)) return;

      const touchState = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        tokenIndex,
        pointerId: e.pointerId,
        tokenElement,
        dragStarted: false,
        cancelledByScroll: false,
        timer: undefined as number | undefined
      };

      if (touchStateRef.current?.timer) {
        window.clearTimeout(touchStateRef.current.timer);
      }

      touchState.timer = window.setTimeout(() => {
        if (touchStateRef.current !== touchState || touchState.cancelledByScroll) return;
        touchState.dragStarted = true;
        try {
          touchState.tokenElement.setPointerCapture(touchState.pointerId);
        } catch {
          // Ignore browsers rejecting capture when pointer already settled
        }
        startWordDrag(messageId, tokenIndex, tokens, container, true);
      }, 350);

      touchStateRef.current = touchState;
    } else {
      e.preventDefault();
      startWordDrag(messageId, tokenIndex, tokens, container, false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const touchState = touchStateRef.current;
    if (!touchState || touchState.cancelledByScroll) return;

    const dx = e.clientX - touchState.startX;
    const dy = e.clientY - touchState.startY;

    if (touchState.dragStarted) {
      const tokenElement = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>(`[data-word-token][data-msg-id="${messageId}"]`);
      const index = Number(tokenElement?.getAttribute('data-token-idx'));
      if (tokenElement && Number.isFinite(index)) updateWordDrag(index);
      return;
    }

    // Let vertical or quick swipe movement scroll before long-press engages
    if (Math.abs(dy) > 8 || Math.abs(dx) > 12) {
      if (touchState.timer) window.clearTimeout(touchState.timer);
      touchState.cancelledByScroll = true;
      touchStateRef.current = null;
    }
  };

  const handlePointerUp = () => {
    const touchState = touchStateRef.current;
    if (!touchState) return;

    if (touchState.timer) window.clearTimeout(touchState.timer);
    const container = containerRef.current;

    // Any quick/medium tap before long-press drag starts selects the single word (no dead zone)
    if (!touchState.dragStarted && !touchState.cancelledByScroll && !isDragging && container) {
      selectSingleWord(messageId, touchState.tokenIndex, tokens, container);
    }

    touchStateRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (touchStateRef.current?.timer) {
          window.clearTimeout(touchStateRef.current.timer);
        }
        touchStateRef.current = null;
      }}
      onContextMenu={(event) => {
        if (touchStateRef.current?.dragStarted) event.preventDefault();
      }}
      style={{ touchAction: isDragging && isCurrentMessage ? 'none' : 'pan-y' }}
      className="inline whitespace-pre-wrap break-words select-none leading-relaxed"
    >
      {tokens.map((token) => {
        const isSelected =
          isCurrentMessage &&
          selectedRange !== null &&
          token.index >= minSelected &&
          token.index <= maxSelected;

        return (
          <React.Fragment key={token.index}>
            <span
              data-word-token
              data-token-idx={token.index}
              data-msg-id={messageId}
              onPointerDown={(e) => handlePointerDown(e, token.index)}
              className={`inline cursor-pointer rounded-[3px] transition-colors duration-150 ease-unslop ${
                isSelected
                  ? '-mx-[2px] bg-amber-300/90 px-[2px] font-medium text-[#1c1917] dark:bg-amber-400 dark:text-[#161513]'
                  : 'hover:bg-black/[0.06] dark:hover:bg-white/[0.09]'
              } ${token.isBold || token.isItalic ? 'font-medium' : ''}`}
            >
              {token.text}
            </span>
            {token.separator}
          </React.Fragment>
        );
      })}
    </div>
  );
};
