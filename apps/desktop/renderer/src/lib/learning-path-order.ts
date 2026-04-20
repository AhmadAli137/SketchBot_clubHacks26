import type { ConceptMapNode } from '@/lib/concept-catalog';

/**
 * Order concepts in prerequisite order (like a Duolingo path): earlier units unlock later ones.
 * Kahn topological sort; ties broken by title for stability.
 */
export function getPathOrderedNodes(nodes: ConceptMapNode[]): ConceptMapNode[] {
  const idSet = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  const remainingPrereqs = new Map<string, number>();
  for (const n of nodes) {
    remainingPrereqs.set(n.id, n.prerequisites.filter((p) => idSet.has(p)).length);
  }

  const queue = nodes
    .filter((n) => (remainingPrereqs.get(n.id) ?? 0) === 0)
    .sort((a, b) => a.title.localeCompare(b.title));

  const result: ConceptMapNode[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const u = queue.shift()!;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    result.push(u);

    for (const v of nodes) {
      if (!v.prerequisites.includes(u.id)) continue;
      const next = (remainingPrereqs.get(v.id) ?? 0) - 1;
      remainingPrereqs.set(v.id, next);
      if (next === 0 && !seen.has(v.id)) {
        queue.push(v);
      }
    }
    queue.sort((a, b) => a.title.localeCompare(b.title));
  }

  for (const n of nodes) {
    if (!seen.has(n.id)) result.push(n);
  }

  return result;
}
