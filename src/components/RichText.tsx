// language: TypeScript (React), file: src/components/RichText.tsx, target: Web / Mobile Browser
import React from 'react';

// Matches **bold**, *italic* and __bold__ without crossing line breaks.
const EMPHASIS = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

interface RichTextProps {
  text: string;
}

/**
 * Renders the small subset of inline emphasis the models occasionally emit.
 * Anything else stays literal text, so no HTML or Markdown is ever executed.
 */
export const RichText: React.FC<RichTextProps> = ({ text }) => {
  const parts = text.split(EMPHASIS);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part;

        const isBold = part.startsWith('**') || part.startsWith('__');
        const inner = isBold ? part.slice(2, -2) : part.slice(1, -1);

        return (
          <strong key={index} className={isBold ? 'font-semibold' : 'font-medium'}>
            {inner}
          </strong>
        );
      })}
    </>
  );
};
