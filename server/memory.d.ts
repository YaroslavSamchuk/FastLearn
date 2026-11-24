export type MemoryScope = 'global' | 'da' | 'en';

export interface MemoryToolEvent {
  action: 'save' | 'update' | 'forget';
  scope: MemoryScope;
  fact: string;
  previousFact?: string;
}

export interface MemoryToolResult {
  memories: Record<MemoryScope, string[]>;
  result: { ok: boolean; message: string };
  event?: MemoryToolEvent;
}

export function applyMemoryTool(
  memories: Record<MemoryScope, string[]>,
  name: string,
  args: unknown
): MemoryToolResult;
