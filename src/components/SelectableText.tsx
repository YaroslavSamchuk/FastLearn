// language: TypeScript (React), file: src/components/SelectableText.tsx, target: Web / Mobile Browser
import React, { useMemo, useRef } from 'react';
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
    timer?: number;
  } | null>(null);

  const tokens = useMemo(() => tokenizeMessage(text), [text]);

  const {
    activeMessageId,
    selectedRange,
    startWordDrag,
    selectSingleWord,
    isDragging
  } = useWordSelection();

  const isCurrentMessage = activeMessageId === messageId;
  const minSelected = selectedRange ? Math.min(selectedRange.start, selectedRange.end) : -1;
  const maxSelected = selectedRange ? Math.max(selectedRange.start, selectedRange.end) : -1;

  const handlePointerDown = (e: React.PointerEvent, tokenIndex: number) => {
    if (isStreaming) return;
    if (e.button !== 0) return; // Only main button

    const container = containerRef.current;
    if (!container) return;

    if (e.pointerType === 'touch') {
      const startX = e.clientX;
      const startY = e.clientY;
      const startTime = Date.now();

      // Clear any prior timer
      if (touchStateRef.current?.timer) {
        window.clearTimeout(touchStateRef.current.timer);
      }

      // If user holds for 140ms, start dragging selection
      const timer = window.setTimeout(() => {
        if (touchStateRef.current) {
          startWordDrag(messageId, tokenIndex, tokens, container, true);
        }
      }, 140);

      touchStateRef.current = {
        startX,
        startY,
        startTime,
        tokenIndex,
        timer
      };
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

    // If user is scrolling vertically, cancel word selection
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      if (touchState.timer) window.clearTimeout(touchState.timer);
      touchStateRef.current = null;
      return;
    }

    // If moved horizontally across words before timer, trigger drag immediately
    if (Math.abs(dx) > 8 && !isDragging && containerRef.current) {
      if (touchState.timer) window.clearTimeout(touchState.timer);
      startWordDrag(messageId, touchState.tokenIndex, tokens, containerRef.current, true);
    }
  };

  const handlePointerUp = () => {
    const touchState = touchStateRef.current;
    if (!touchState) return;

    if (touchState.timer) window.clearTimeout(touchState.timer);
    const container = containerRef.current;

    // Quick tap detection (held less than 220ms and barely moved)
    if (!isDragging && container && Date.now() - touchState.startTime < 260) {
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
              className={`inline rounded-[4px] px-[2.5px] py-[0.5px] transition-colors duration-100 ${
                isSelected
                  ? 'bg-amber-300 font-medium text-stone-950 shadow-sm dark:bg-amber-400 dark:text-stone-950'
                  : 'hover:bg-stone-200/60 dark:hover:bg-white/[0.08]'
              } ${token.isBold ? 'font-semibold' : ''} ${token.isItalic ? 'italic' : ''}`}
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
