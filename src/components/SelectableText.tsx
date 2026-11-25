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
      if (touchStateRef.current?.dragStarted) event.preventDefault();
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', handleTouchMove);
  }, []);

  const isCurrentMessage = activeMessageId === messageId;
  const minSelected = selectedRange ? Math.min(selectedRange.start, selectedRange.end) : -1;
  const maxSelected = selectedRange ? Math.max(selectedRange.start, selectedRange.end) : -1;

  const handlePointerDown = (e: React.PointerEvent, tokenIndex: number) => {
    if (isStreaming) return;
    if (e.button !== 0) return; // Only main button

    const container = containerRef.current;
    if (!container) return;

    if (e.pointerType === 'touch') {
      const tokenElement = e.currentTarget;
      if (!(tokenElement instanceof HTMLElement)) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startTime = Date.now();
      const touchState = {
        startX,
        startY,
        startTime,
        tokenIndex,
        pointerId: e.pointerId,
        tokenElement,
        dragStarted: false,
        timer: undefined as number | undefined
      };

      // Clear any prior timer
      if (touchStateRef.current?.timer) {
        window.clearTimeout(touchStateRef.current.timer);
      }

      touchState.timer = window.setTimeout(() => {
        if (touchStateRef.current !== touchState) return;
        touchState.dragStarted = true;
        touchState.tokenElement.setPointerCapture(touchState.pointerId);
        startWordDrag(messageId, tokenIndex, tokens, container, true);
      }, 350);

      touchStateRef.current = touchState;
    } else {
      // Desktop mouse / trackpad
      e.preventDefault();
      startWordDrag(messageId, tokenIndex, tokens, container, false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const touchState = touchStateRef.current;
    if (!touchState) return;

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

    // Let vertical movement scroll the chat before long-press selection begins.
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      if (touchState.timer) window.clearTimeout(touchState.timer);
      touchStateRef.current = null;
      return;
    }
    if (Math.abs(dx) > 12) {
      if (touchState.timer) window.clearTimeout(touchState.timer);
      touchStateRef.current = null;
    }
  };

  const handlePointerUp = () => {
    const touchState = touchStateRef.current;
    if (!touchState) return;

    if (touchState.timer) window.clearTimeout(touchState.timer);
    const container = containerRef.current;

    // Quick tap detection (held less than 220ms and barely moved)
    if (!touchState.dragStarted && !isDragging && container && Date.now() - touchState.startTime < 260) {
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
              className={`inline rounded-[2px] px-[2px] py-[0.5px] transition-colors duration-150 ${
                isSelected
                  ? 'bg-amber-300 font-medium text-[#111113] dark:bg-amber-400 dark:text-[#111113]'
                  : 'hover:bg-black/[0.07] dark:hover:bg-white/[0.1]'
              } ${token.isBold ? 'font-medium' : ''} ${token.isItalic ? 'italic' : ''}`}
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
