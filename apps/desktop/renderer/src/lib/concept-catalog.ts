import conceptsJson from '../../../../../services/cloud-backend/data/concepts.json';

import type { ConceptDefinition, ConceptLayer } from './concept-types';

export type ConceptPreview = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  domain: string;
  starterPrompt: string;
  defaultLayer: ConceptLayer;
};

export type ConceptMapNode = {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  domain: string;
  prerequisites: string[];
  x: number;
  y: number;
};

const concepts = conceptsJson as ConceptDefinition[];

/** Physical robot / competition labs — used for motion accents and theming */
export const ROBOT_LAB_CONCEPT_IDS = [
  'cone-ring-gauntlet',
  'sumo-arena',
  'maze-marathon',
] as const;

const MAP_LAYOUT: Record<string, { x: number; y: number }> = {
  'coord-systems': { x: 50, y: 14 },
  'geometry-drawing': { x: 22, y: 40 },
  'trigonometry-motion': { x: 50, y: 40 },
  'path-planning': { x: 78, y: 40 },
  'computer-vision': { x: 22, y: 68 },
  'control-theory': { x: 78, y: 68 },
  'cone-ring-gauntlet': { x: 28, y: 76 },
  'sumo-arena': { x: 50, y: 76 },
  'maze-marathon': { x: 72, y: 76 },
  'systems-engineering': { x: 50, y: 91 },
};

function getStarterPrompt(concept: ConceptDefinition): string {
  return (
    concept.layers.intuitive.starter_prompt ??
    concept.layers.structural.starter_prompt ??
    concept.layers.precise.starter_prompt ??
    `explore ${concept.title.toLowerCase()}`
  );
}

export function getConceptCatalog(): ConceptDefinition[] {
  return concepts;
}

export function getConceptById(conceptId: string | null | undefined): ConceptDefinition | null {
  if (!conceptId) {
    return null;
  }

  return concepts.find((concept) => concept.concept_id === conceptId) ?? null;
}

export function getConceptPreviews(): ConceptPreview[] {
  return concepts.map((concept) => ({
    id: concept.concept_id,
    title: concept.title,
    subtitle: concept.subtitle,
    emoji: concept.emoji,
    domain: concept.domain,
    starterPrompt: getStarterPrompt(concept),
    defaultLayer: 'intuitive',
  }));
}

export function getConceptStructuralStarter(conceptId: string | null | undefined): {
  title: string;
  blockTemplate?: string;
  tutorIntro: string;
  starterPrompt?: string;
} | null {
  const concept = getConceptById(conceptId);
  if (!concept) {
    return null;
  }

  return {
    title: concept.title,
    blockTemplate: concept.layers.structural.block_template,
    tutorIntro: concept.layers.structural.tutor_intro,
    starterPrompt: concept.layers.structural.starter_prompt,
  };
}

export function getConceptCodeStarter(conceptId: string | null | undefined): {
  title: string;
  tutorIntro: string;
  codeScaffold?: string;
  mathNotation?: string;
  starterPrompt?: string;
} | null {
  const concept = getConceptById(conceptId);
  if (!concept) {
    return null;
  }

  return {
    title: concept.title,
    tutorIntro: concept.layers.precise.tutor_intro,
    codeScaffold: concept.layers.precise.code_scaffold,
    mathNotation: concept.layers.precise.math_notation,
    starterPrompt: concept.layers.precise.starter_prompt,
  };
}

export function getConceptMapNodes(): ConceptMapNode[] {
  return concepts.map((concept, index) => {
    const fallbackY = 18 + index * 11;
    const layout = MAP_LAYOUT[concept.concept_id] ?? { x: 50, y: fallbackY };

    return {
      id: concept.concept_id,
      title: concept.title,
      emoji: concept.emoji,
      subtitle: concept.subtitle,
      domain: concept.domain,
      prerequisites: concept.prerequisite_ids ?? [],
      x: layout.x,
      y: layout.y,
    };
  });
}
