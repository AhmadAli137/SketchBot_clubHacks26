// ─── Motrix Game Economy ───────────────────────────────────────────────────────
// Sparks (⚡) are earned by completing concepts, layers, streaks, and challenges.
// Spent in the Avatar Shop on robot skins, colors, and particle trails.

export type ChestTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export type ChestDefinition = {
  id: string;
  tier: ChestTier;
  label: string;
  emoji: string;
  sparksMin: number;
  sparksMax: number;
  bonusItemChance: number; // 0–1
  milestoneAfterConcepts: number;
};

export type ShopItemCategory = 'body' | 'color' | 'trail' | 'emote' | 'badge-frame';

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  category: ShopItemCategory;
  emoji: string;
  sparkCost: number;
  previewColor?: string;
  previewGradient?: string;
};

// ─── Spark earn rates ─────────────────────────────────────────────────────────

export const SPARK_RATES = {
  layer_intuitive: 15,
  layer_structural: 25,
  layer_precise: 40,
  concept_mastered: 80,
  streak_day: 5,
  challenge_win: 50,
  perfect_score: 30,
  badge_earned: 20,
  lesson_completed: 10,
} as const;

// ─── Chests ───────────────────────────────────────────────────────────────────

export const CHESTS: ChestDefinition[] = [
  { id: 'chest-1',  tier: 'bronze',    label: 'Rookie Chest',   emoji: '📦', sparksMin: 20,  sparksMax: 40,  bonusItemChance: 0.1, milestoneAfterConcepts: 1  },
  { id: 'chest-2',  tier: 'bronze',    label: 'Scout Chest',    emoji: '📦', sparksMin: 25,  sparksMax: 50,  bonusItemChance: 0.1, milestoneAfterConcepts: 2  },
  { id: 'chest-3',  tier: 'silver',    label: 'Explorer Chest', emoji: '🎁', sparksMin: 50,  sparksMax: 90,  bonusItemChance: 0.3, milestoneAfterConcepts: 3  },
  { id: 'chest-4',  tier: 'silver',    label: 'Builder Chest',  emoji: '🎁', sparksMin: 60,  sparksMax: 100, bonusItemChance: 0.3, milestoneAfterConcepts: 5  },
  { id: 'chest-5',  tier: 'gold',      label: 'Hero Chest',     emoji: '🏆', sparksMin: 100, sparksMax: 180, bonusItemChance: 0.6, milestoneAfterConcepts: 7  },
  { id: 'chest-6',  tier: 'gold',      label: 'Master Chest',   emoji: '🏆', sparksMin: 120, sparksMax: 200, bonusItemChance: 0.6, milestoneAfterConcepts: 9  },
  { id: 'chest-7',  tier: 'legendary', label: 'Legend Chest',   emoji: '👑', sparksMin: 200, sparksMax: 350, bonusItemChance: 1.0, milestoneAfterConcepts: 10 },
];

export function getChestForConceptCount(masteredCount: number): ChestDefinition | null {
  const candidates = CHESTS.filter((c) => c.milestoneAfterConcepts === masteredCount);
  return candidates[0] ?? null;
}

export function rollChest(chest: ChestDefinition): { sparks: number; bonusItemId: string | null } {
  const sparks = chest.sparksMin + Math.floor(Math.random() * (chest.sparksMax - chest.sparksMin + 1));
  const bonusItemId = Math.random() < chest.bonusItemChance ? rollBonusItem(chest.tier) : null;
  return { sparks, bonusItemId };
}

function rollBonusItem(tier: ChestTier): string {
  const pool = SHOP_ITEMS.filter((item) => {
    if (tier === 'bronze') return item.sparkCost <= 80;
    if (tier === 'silver') return item.sparkCost <= 150;
    if (tier === 'gold') return item.sparkCost <= 300;
    return true;
  });
  if (pool.length === 0) return SHOP_ITEMS[0].id;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ─── Shop Items ───────────────────────────────────────────────────────────────

export const SHOP_ITEMS: ShopItem[] = [
  // ── Body skins ────────────────────────────────────────────────────────────
  {
    id: 'body-orbit',      name: 'Orbit',       description: 'Classic round chassis',   category: 'body',  emoji: '🤖', sparkCost: 0,
  },
  {
    id: 'body-stealth',    name: 'Stealth',      description: 'Matte black angular frame', category: 'body', emoji: '🖤', sparkCost: 120,
    previewGradient: 'linear-gradient(135deg, #1a1a2e, #16213e)',
  },
  {
    id: 'body-chrome',     name: 'Chrome',       description: 'Mirror-finish titanium',   category: 'body', emoji: '🪩', sparkCost: 200,
    previewGradient: 'linear-gradient(135deg, #8a9bb0, #d0dce8)',
  },
  {
    id: 'body-neon',       name: 'Neon Racer',   description: 'LED-striped racing chassis', category: 'body', emoji: '🌈', sparkCost: 180,
    previewGradient: 'linear-gradient(135deg, #ff00cc, #3333ff)',
  },
  {
    id: 'body-jungle',     name: 'Jungle',       description: 'Camo pattern plating',     category: 'body', emoji: '🌿', sparkCost: 90,
    previewGradient: 'linear-gradient(135deg, #2d5a27, #5c8a3c)',
  },
  {
    id: 'body-candy',      name: 'Candy',        description: 'Bubblegum pink shell',      category: 'body', emoji: '🍭', sparkCost: 75,
    previewGradient: 'linear-gradient(135deg, #ff6eb4, #ffc1e3)',
  },

  // ── Color accents ──────────────────────────────────────────────────────────
  {
    id: 'color-cyan',      name: 'Cyan Spark',   description: 'Default cyan accent',       category: 'color', emoji: '💙', sparkCost: 0,   previewColor: '#5de4ff',
  },
  {
    id: 'color-violet',    name: 'Violet Surge', description: 'Deep purple glow',          category: 'color', emoji: '💜', sparkCost: 40,  previewColor: '#a855f7',
  },
  {
    id: 'color-amber',     name: 'Amber Blaze',  description: 'Warm golden accent',        category: 'color', emoji: '🟡', sparkCost: 40,  previewColor: '#ffc96b',
  },
  {
    id: 'color-green',     name: 'Volt Green',   description: 'Electric lime glow',        category: 'color', emoji: '💚', sparkCost: 50,  previewColor: '#4dffb8',
  },
  {
    id: 'color-red',       name: 'Danger Red',   description: 'Fierce combat accent',      category: 'color', emoji: '🔴', sparkCost: 60,  previewColor: '#ff4f6b',
  },
  {
    id: 'color-gold',      name: 'Championship Gold', description: 'For legends only',    category: 'color', emoji: '🥇', sparkCost: 250, previewColor: '#ffd700',
  },

  // ── Particle trails ────────────────────────────────────────────────────────
  {
    id: 'trail-none',      name: 'No Trail',     description: 'Clean and stealthy',        category: 'trail', emoji: '⬜', sparkCost: 0,
  },
  {
    id: 'trail-sparks',    name: 'Spark Burst',  description: 'Electric sparks follow you', category: 'trail', emoji: '⚡', sparkCost: 80,
  },
  {
    id: 'trail-stardust',  name: 'Stardust',     description: 'Glittery star particles',   category: 'trail', emoji: '✨', sparkCost: 100,
  },
  {
    id: 'trail-fire',      name: 'Fire Tail',    description: 'Flames erupt behind you',   category: 'trail', emoji: '🔥', sparkCost: 150,
  },
  {
    id: 'trail-rainbow',   name: 'Rainbow',      description: 'Full RGB spectrum trail',   category: 'trail', emoji: '🌈', sparkCost: 220,
  },

  // ── Emotes ────────────────────────────────────────────────────────────────
  {
    id: 'emote-wave',      name: 'Wave',         description: 'Friendly greeting',          category: 'emote', emoji: '👋', sparkCost: 30,
  },
  {
    id: 'emote-flex',      name: 'Flex',         description: 'Victory pose',               category: 'emote', emoji: '💪', sparkCost: 60,
  },
  {
    id: 'emote-spin',      name: 'Spin',         description: 'Victory spin move',          category: 'emote', emoji: '🌀', sparkCost: 80,
  },
  {
    id: 'emote-celebrate', name: 'Celebrate',    description: 'Party time explosion',       category: 'emote', emoji: '🎉', sparkCost: 120,
  },

  // ── Badge frames ──────────────────────────────────────────────────────────
  {
    id: 'frame-none',      name: 'No Frame',     description: 'Default clean look',         category: 'badge-frame', emoji: '⬜', sparkCost: 0,
  },
  {
    id: 'frame-circuit',   name: 'Circuit Board', description: 'PCB trace border',          category: 'badge-frame', emoji: '💚', sparkCost: 70, previewColor: '#21b078',
  },
  {
    id: 'frame-fire',      name: 'Flame Ring',   description: 'Fire wreath border',         category: 'badge-frame', emoji: '🔥', sparkCost: 110,
  },
  {
    id: 'frame-galaxy',    name: 'Galaxy',       description: 'Starfield animated border',  category: 'badge-frame', emoji: '🌌', sparkCost: 200, previewGradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  },
  {
    id: 'frame-champion',  name: 'Champion',     description: 'Golden trophy border',       category: 'badge-frame', emoji: '🏆', sparkCost: 300, previewColor: '#ffd700',
  },
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

export function getShopItemsByCategory(category: ShopItemCategory): ShopItem[] {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

// ─── Tier visual config ───────────────────────────────────────────────────────

export const CHEST_TIER_STYLE: Record<ChestTier, { bg: string; glow: string; label: string }> = {
  bronze:    { bg: 'linear-gradient(135deg, #7c4a1e, #c87941)', glow: 'rgba(200,121,65,0.5)',  label: '#c87941' },
  silver:    { bg: 'linear-gradient(135deg, #4a5568, #9aa5b4)', glow: 'rgba(154,165,180,0.5)', label: '#9aa5b4' },
  gold:      { bg: 'linear-gradient(135deg, #92400e, #fbbf24)', glow: 'rgba(251,191,36,0.6)',  label: '#fbbf24' },
  legendary: { bg: 'linear-gradient(135deg, #4c1d95, #7c3aed, #db2777)', glow: 'rgba(168,85,247,0.7)', label: '#c084fc' },
};
