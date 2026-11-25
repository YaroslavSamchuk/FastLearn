// language: TypeScript (React), file: src/context/SelectionContext.tsx, target: Web / Mobile Browser
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SelectionData } from '../types.ts';
import {
  MAX_SELECTION_WORDS,
  WordToken,
  clampSelectionRange,
  cleanTextForTranslation
} from '../utils/textTokens.ts';
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
  const selectionIdRef = useRef(0);

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
    (
      messageId: string,
      startIdx: number,
      endIdx: number,
      containerEl: HTMLElement,
      tokens: WordToken[],
      selectionId: number
    ) => {
      const clampedRange = clampSelectionRange(startIdx, endIdx, MAX_SELECTION_WORDS);
      const minIdx = Math.min(clampedRange.start, clampedRange.end);
      const maxIdx = Math.max(clampedRange.start, clampedRange.end);

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

      const vv = window.visualViewport;
      const viewportWidth = vv?.width ?? window.innerWidth;
      const viewportLeft = vv?.offsetLeft ?? 0;
      const popoverWidth = Math.min(350, viewportWidth - 24);
      const halfWidth = popoverWidth / 2;

      let x = (minX + maxX) / 2;
      x = Math.max(viewportLeft + 12 + halfWidth, Math.min(x, viewportLeft + viewportWidth - 12 - halfWidth));

      const estimatedHeight = 200;
      const topRoom = minY - (vv?.offsetTop ?? 0) - 68;
      const placement: 'top' | 'bottom' = topRoom >= estimatedHeight ? 'top' : 'bottom';
      const y = placement === 'top' ? minY - 8 : maxY + 8;

      setSelection({
        id: selectionId,
        text: cleanPhrase,
        x,
        y,
        anchorTop: minY,
        anchorBottom: maxY,
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
      const next = clampSelectionRange(prev.start, wordIndex, MAX_SELECTION_WORDS);
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
      calculateSelectionGeometry(
        msgId,
        range.start,
        range.end,
        container,
        tokens,
        ++selectionIdRef.current
      );
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
      calculateSelectionGeometry(
        messageId,
        wordIndex,
        wordIndex,
        containerEl,
        tokens,
        ++selectionIdRef.current
      );
    },
    [calculateSelectionGeometry]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const msgId = messageIdRef.current;
      if (!msgId) return;

      const element = document.elementFromPoint(e.clientX, e.clientY);
      const tokenEl = element?.closest(`[data-word-token][data-msg-id="${msgId}"]`);
      if (tokenEl) {
        const idx = Number(tokenEl.getAttribute('data-token-idx'));
        if (!Number.isNaN(idx)) {
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

      const scrollHost = container.closest('.overflow-y-auto') ?? container;
      const containerRect = scrollHost.getBoundingClientRect();
      const firstRect = elements[0].getBoundingClientRect();
      const lastRect = elements[elements.length - 1].getBoundingClientRect();

      if (lastRect.bottom < containerRect.top || firstRect.top > containerRect.bottom) {
        clearSelection();
        return;
      }

      calculateSelectionGeometry(msgId, range.start, range.end, container, tokens, selectionIdRef.current);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [selection, calculateSelectionGeometry, clearSelection]);

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
