/**
 * Program store — module-level mutable state for the kid's current program,
 * with a React-friendly subscribe/notify channel.
 *
 * The tutor appends/edits/clears via the tool-call dispatch path; the
 * Programming tab's React component subscribes and re-renders. Kept off
 * React's reconciler tree so a tutor turn that emits five blocks doesn't
 * trigger five separate re-renders mid-stream.
 *
 * Why a global store: the tutor (one place), the Programming tab (another
 * place), the executor (third place), and the runtime "currently active
 * block" highlight all need to read/write the same program state. Lifting
 * to React Context would require remounting half the tree on tutor
 * messages.
 */

import type { Program, ProgramBlock } from './program-schema';

let program: Program = { id: 'p-default', blocks: [] };
const listeners = new Set<(p: Program) => void>();

function notify(): void {
  // Defensive copy — listeners shouldn't mutate the live state.
  const snapshot: Program = { id: program.id, blocks: [...program.blocks] };
  for (const fn of listeners) fn(snapshot);
}

export function getProgram(): Program {
  return { id: program.id, blocks: [...program.blocks] };
}

export function subscribeProgram(fn: (p: Program) => void): () => void {
  listeners.add(fn);
  // Push current state immediately so freshly-mounted components have data.
  fn({ id: program.id, blocks: [...program.blocks] });
  return () => { listeners.delete(fn); };
}

export function appendBlock(block: ProgramBlock): void {
  program.blocks.push(block);
  notify();
}

export function insertBlockAt(index: number, block: ProgramBlock): void {
  const i = Math.max(0, Math.min(index, program.blocks.length));
  program.blocks.splice(i, 0, block);
  notify();
}

export function removeBlock(blockId: string): void {
  program.blocks = program.blocks.filter((b) => b.id !== blockId);
  notify();
}

export function replaceProgram(next: Program): void {
  program = { id: next.id, blocks: [...next.blocks] };
  notify();
}

export function clearProgram(): void {
  program = { id: program.id, blocks: [] };
  notify();
}

/** Generate a stable block id. The tutor SHOULD provide its own ids
 *  (so it can reference them in follow-up turns), but for renderer-side
 *  inserts and as a fallback we synthesise one. */
let nextLocalId = 1;
export function newBlockId(): string {
  return `b-${Date.now().toString(36)}-${nextLocalId++}`;
}
