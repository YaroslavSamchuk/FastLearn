const SCOPES = new Set(['global', 'da', 'en']);
const MAX_FACT_CHARS = 200;
const MAX_FACTS_PER_SCOPE = 40;

function cleanString(value, maxChars) {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

export function applyMemoryTool(memories, name, args) {
  if (!['save_memory', 'update_memory', 'forget_memory'].includes(name)) {
    throw new Error('Unsupported memory action');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Memory tool arguments must be an object');
  }

  const scope = SCOPES.has(args.scope) ? args.scope : null;
  const fact = cleanString(args.fact, MAX_FACT_CHARS);
  if (!scope || !fact) throw new Error('A valid memory scope and fact are required');

  const facts = memories[scope];
  let action;
  let previousFact;
  let nextFacts;

  if (name === 'save_memory') {
    if (facts.includes(fact)) return { memories, result: { ok: true, message: 'That fact is already saved.' } };
    if (facts.length >= MAX_FACTS_PER_SCOPE) {
      return { memories, result: { ok: false, message: 'Memory is full; no fact was saved.' } };
    }
    action = 'save';
    nextFacts = [...facts, fact];
  } else if (name === 'update_memory') {
    previousFact = cleanString(args.previousFact, MAX_FACT_CHARS);
    if (!previousFact) throw new Error('The exact existing fact to update is required');
    const index = facts.indexOf(previousFact);
    if (index < 0) {
      return { memories, result: { ok: false, message: 'The existing fact was not found; no changes were made.' } };
    }
    if (fact !== previousFact && facts.includes(fact)) {
      return { memories, result: { ok: false, message: 'The updated fact already exists; no changes were made.' } };
    }
    action = 'update';
    nextFacts = facts.map((item, itemIndex) => (itemIndex === index ? fact : item));
  } else {
    if (!facts.includes(fact)) {
      return { memories, result: { ok: false, message: 'The fact was not found; no changes were made.' } };
    }
    action = 'forget';
    nextFacts = facts.filter((item) => item !== fact);
  }

  return {
    memories: { ...memories, [scope]: nextFacts },
    result: { ok: true, message: `Memory ${action} completed.` },
    event: {
      action,
      scope,
      fact,
      ...(previousFact ? { previousFact } : {})
    }
  };
}
