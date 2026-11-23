import { useState, useEffect, useCallback, useRef } from 'react';
import { SelectionData } from '../types.ts';

interface UseSelectionOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect?: (text: string) => void;
  maxWords?: number;
}

export function useSelection({ containerRef, onSelect, maxWords = 30 }: UseSelectionOptions) {
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const lastSelectedText = useRef<string>('');

  const clearSelection = useCallback(() => {
    setSelection(null);
    lastSelectedText.current = '';
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleSelectionProcess = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const rawText = sel.toString().trim();
    if (!rawText) return;

    // Check if selection happened inside chat container
    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (container && !container.contains(range.commonAncestorContainer)) {
      return;
    }

    // Split words and clamp to maxWords (20-30 words)
    const words = rawText.split(/\s+/);
    const clampedWords = words.slice(0, maxWords);
    const clampedText = clampedWords.join(' ');

    if (clampedText === lastSelectedText.current) {
      return;
    }
    lastSelectedText.current = clampedText;

    // Calculate position for popover
    const rect = range.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const popoverWidth = Math.min(320, viewportWidth - 32);

    // Center horizontally over selection, clamped to screen edges
    let x = rect.left + rect.width / 2;
    if (x - popoverWidth / 2 < 16) {
      x = 16 + popoverWidth / 2;
    } else if (x + popoverWidth / 2 > viewportWidth - 16) {
      x = viewportWidth - 16 - popoverWidth / 2;
    }

    // Determine top or bottom placement
    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' = spaceAbove > 180 ? 'top' : 'bottom';
    const y = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    setSelection({
      text: clampedText,
      x,
      y,
      placement
    });

    if (onSelect) {
      onSelect(clampedText);
    }
  }, [containerRef, onSelect, maxWords]);

  useEffect(() => {
    const handleMouseUp = () => {
      // Small timeout to let browser finalize selection range
      setTimeout(handleSelectionProcess, 20);
    };

    const handleTouchEnd = () => {
      setTimeout(handleSelectionProcess, 150);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleSelectionProcess]);

  return { selection, clearSelection };
}
