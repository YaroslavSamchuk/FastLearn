import React, { useRef, useMemo } from 'react';
import type { WordMap, WordStatus } from '../../types';
import { cleanDanishWord } from '../../services/dictionary';

interface InteractiveTextProps {
  text: string;
  wordsMap: WordMap;
  onWordClick: (word: string, contextSentence: string, targetRect: DOMRect) => void;
  onPhraseSelect?: (phraseText: string, targetRect: DOMRect) => void;
  selectedPhrase?: string | null;
}

export const InteractiveText: React.FC<InteractiveTextProps> = ({
  text,
  wordsMap,
  onWordClick,
  onPhraseSelect,
  selectedPhrase,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Split text into word tokens and whitespace/punctuation tokens
  const tokens = useMemo(() => {
    if (!text) return [];
    // Matches Danish words (including letters æ, ø, å, é and apostrophes like i'm/d') vs other symbols
    const regex = /([a-zA-ZæøåÆØÅéÉ0-9]+(?:'[a-zA-ZæøåÆØÅ]+)?|[^\s\wæøåÆØÅéÉ]+|\s+)/g;
    return text.match(regex) || [text];
  }, [text]);

  const handleMouseUp = () => {
    if (!onPhraseSelect || !containerRef.current) return;

    // Detect browser window selection
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) return;

    // Check if selection occurred within our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      onPhraseSelect(selectedText, rect);
    }
  };

  const getSentenceContext = (index: number): string => {
    // Find the sentence boundaries around this token
    let start = index;
    while (start > 0 && !/[.!?\n]/.test(tokens[start - 1])) {
      start--;
    }
    let end = index;
    while (end < tokens.length - 1 && !/[.!?\n]/.test(tokens[end])) {
      end++;
    }
    return tokens.slice(start, end + 1).join('').trim();
  };

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="inline leading-relaxed select-text"
    >
      {tokens.map((token, idx) => {
        const isWord = /[a-zA-ZæøåÆØÅéÉ0-9]/.test(token);

        if (!isWord) {
          // Render punctuation or whitespace as plain text
          return <span key={idx}>{token}</span>;
        }

        const clean = cleanDanishWord(token);
        const record = wordsMap[clean];
        const status: WordStatus = record !== undefined ? record.status : 0; // Default to 0 (New)

        const isPhraseMatch = selectedPhrase && selectedPhrase.includes(token);

        let statusClass = 'lingq-status-0';
        if (status === 1) statusClass = 'lingq-status-1';
        else if (status === 2) statusClass = 'lingq-status-2';
        else if (status === 3) statusClass = 'lingq-status-3';

        return (
          <span
            key={idx}
            className={`lingq-token ${isPhraseMatch ? 'lingq-selected' : statusClass}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const sentence = getSentenceContext(idx);
              onWordClick(token, sentence, rect);
            }}
            title={record?.translation_uk ? `${token}: ${record.translation_uk}` : token}
          >
            {token}
          </span>
        );
      })}
    </div>
  );
};
