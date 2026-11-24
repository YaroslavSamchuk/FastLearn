// language: TypeScript (React), file: src/context/SelectionContext.tsx, target: Web / Mobile Browser
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SelectionData } from '../types.ts';
import { WordToken, cleanTextForTranslation } from '../utils/textTokens.ts';
import { haptic } from '../utils/haptics.ts';

interface SelectionContextValue {
  selection: SelectionData | null;
  activeMessageId: string | null;
  selectedRange: { start: number; end: number } | null;
  isDragging: boolean;
  clearSelection: () => void;
  startWordDrag: (
    messageId: string,
    wordIndex: number,
    tokens: WordToken[],
    containerEl: HTMLElement,
    isTouch: boolean
  ) => void;
  updateWordDrag: (wordIndex: number) => void;
  endWordDrag: () => void;
  selectSingleWord: (
    messageId: string,
    wordIndex: number,
    tokens: WordToken[],
    containerEl: HTMLElement
  ) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activeTokensRef = useRef<WordToken[]>([]);
  const containerElRef = useRef<HTMLElement | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const messageIdRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setActiveMessageId(null);
    setSelectedRange(null);
    setIsDragging(false);
    activeTokensRef.current = [];
    containerElRef.current = null;
    rangeRef.current = null;
    messageIdRef.current = null;
  }, []);

  const calculateSelectionGeometry = useCallback(
    (messageId: string, startIdx: number, endIdx: number, containerEl: HTMLElement, tokens: WordToken[]) => {
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);

      const matchedTokens = tokens.filter((t) => t.index >= minIdx && t.index <= maxIdx);
      if (matchedTokens.length === 0) return;

      const rawPhrase = matchedTokens.map((t) => t.text).join(' ');
      const cleanPhrase = cleanTextForTranslation(rawPhrase);
      if (!cleanPhrase) return;

      const tokenElements = Array.from(
        containerEl.querySelectorAll(`[data-word-token][data-msg-id="${messageId}"]`)
      ).filter((el) => {
        const idx = Number(el.getAttribute('data-token-idx'));
        return idx >= minIdx && idx <= maxIdx;
      });

      if (tokenElements.length === 0) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const el of tokenElements) {
        const r = el.getBoundingClientRect();
        if (r.left < minX) minX = r.left;
        if (r.right > maxX) maxX = r.right;
        if (r.top < minY) minY = r.top;
        if (r.bottom > maxY) maxY = r.bottom;
      }

      const viewportWidth = window.innerWidth;
      const popoverWidth = Math.min(350, viewportWidth - 24);
      const halfWidth = popoverWidth / 2;

      let x = (minX + maxX) / 2;
      x = Math.max(12 + halfWidth, Math.min(x, viewportWidth - 12 - halfWidth));

      const estimatedHeight = 210;
      const placement: 'top' | 'bottom' = minY - estimatedHeight - 12 > 0 ? 'top' : 'bottom';
      const y = placement === 'top' ? minY - 8 : maxY + 8;

      setSelection({
        text: cleanPhrase,
        x,
        y,
        placement
      });
    },
    []
  );

  const startWordDrag = useCallback(
    (messageId: string, wordIndex: number, tokens: WordToken[], containerEl: HTMLElement, isTouch: boolean) => {
      setActiveMessageId(messageId);
      messageIdRef.current = messageId;
      setSelectedRange({ start: wordIndex, end: wordIndex });
      rangeRef.current = { start: wordIndex, end: wordIndex };
      setIsDragging(true);
      activeTokensRef.current = tokens;
      containerElRef.current = containerEl;
      if (isTouch) {
        haptic.tap();
      }
    },
    []
  );

  const updateWordDrag = useCallback((wordIndex: number) => {
    setSelectedRange((prev) => {
      if (!prev) return { start: wordIndex, end: wordIndex };
      const next = { ...prev, end: wordIndex };
      rangeRef.current = next;
      return next;
    });
  }, []);

  const endWordDrag = useCallback(() => {
    setIsDragging(false);
    const range = rangeRef.current;
    const msgId = messageIdRef.current;
    const container = containerElRef.current;
    const tokens = activeTokensRef.current;

    if (range && msgId && container && tokens.length > 0) {
      calculateSelectionGeometry(msgId, range.start, range.end, container, tokens);
    }
  }, [calculateSelectionGeometry]);

  const selectSingleWord = useCallback(
    (messageId: string, wordIndex: number, tokens: WordToken[], containerEl: HTMLElement) => {
      setActiveMessageId(messageId);
      messageIdRef.current = messageId;
      setSelectedRange({ start: wordIndex, end: wordIndex });
      rangeRef.current = { start: wordIndex, end: wordIndex };
      setIsDragging(false);
      activeTokensRef.current = tokens;
      containerElRef.current = containerEl;
      haptic.tap();
      calculateSelectionGeometry(messageId, wordIndex, wordIndex, containerEl, tokens);
    },
    [calculateSelectionGeometry]
  );

  // Global mouse/touch move and up listeners for seamless drag across words
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const msgId = messageIdRef.current;
      if (!msgId) return;

      const element = document.elementFromPoint(e.clientX, e.clientY);
      const tokenEl = element?.closest(`[data-word-token][data-msg-id="${msgId}"]`);
      if (tokenEl) {
        const idx = Number(tokenEl.getAttribute('data-token-idx'));
        if (!isNaN(idx)) {
          updateWordDrag(idx);
        }
      }
    };

    const handlePointerUp = () => {
      endWordDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, updateWordDrag, endWordDrag]);

  // Reposition or dismiss popover during chat scroll
  useEffect(() => {
    if (!selection || !containerElRef.current || !messageIdRef.current || !rangeRef.current) return;

    const handleScroll = () => {
      const range = rangeRef.current;
      const msgId = messageIdRef.current;
      const container = containerElRef.current;
      const tokens = activeTokensRef.current;
      if (!range || !msgId || !container || tokens.length === 0) return;

      const minIdx = Math.min(range.start, range.end);
      const maxIdx = Math.max(range.start, range.end);

      const elements = Array.from(
        container.querySelectorAll(`[data-word-token][data-msg-id="${msgId}"]`)
      ).filter((el) => {
        const idx = Number(el.getAttribute('data-token-idx'));
        return idx >= minIdx && idx <= maxIdx;
      });

      if (elements.length === 0) {
        clearSelection();
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const firstRect = elements[0].getBoundingClientRect();
      const lastRect = elements[elements.length - 1].getBoundingClientRect();

      // Check if tokens scrolled out of visible view
      if (lastRect.bottom < containerRect.top || firstRect.top > containerRect.bottom) {
        clearSelection();
        return;
      }

      calculateSelectionGeometry(msgId, range.start, range.end, container, tokens);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [selection, calculateSelectionGeometry, clearSelection]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  return (
    <SelectionContext.Provider
      value={{
        selection,
        activeMessageId,
        selectedRange,
        isDragging,
        clearSelection,
        startWordDrag,
        updateWordDrag,
        endWordDrag,
        selectSingleWord
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
};

export function useWordSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useWordSelection must be used within a SelectionProvider');
  }
  return context;
}
