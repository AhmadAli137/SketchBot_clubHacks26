'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Zap, Check, Lock } from 'lucide-react';

import {
  SHOP_ITEMS,
  getShopItemsByCategory,
  type ShopItemCategory,
} from '@/lib/game-economy';
import { getSparks, purchaseShopItem, getOwnedItems } from '@/lib/progress-store';
import { playSfx } from '@/lib/game-audio';

type AvatarShopProps = {
  studentName: string;
  onClose: () => void;
  onPurchase?: (itemId: string) => void;
};

const CATEGORIES: { id: ShopItemCategory; label: string; emoji: string }[] = [
  { id: 'body',        label: 'Bodies',   emoji: '🤖' },
  { id: 'color',       label: 'Colors',   emoji: '🎨' },
  { id: 'trail',       label: 'Trails',   emoji: '✨' },
  { id: 'emote',       label: 'Emotes',   emoji: '🎭' },
  { id: 'badge-frame', label: 'Frames',   emoji: '🖼️' },
];

export function AvatarShop({ studentName, onClose, onPurchase }: AvatarShopProps) {
  const [activeCategory, setActiveCategory] = useState<ShopItemCategory>('body');
  const [sparks, setSparks] = useState(() => getSparks(studentName));
  const [owned, setOwned] = useState<string[]>(() => getOwnedItems(studentName));
  const [justBought, setJustBought] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const items = getShopItemsByCategory(activeCategory);

  const handleBuy = (itemId: string, cost: number) => {
    if (owned.includes(itemId)) return;
    if (sparks < cost) { playSfx('error'); return; }
    const ok = purchaseShopItem(studentName, itemId, cost);
    if (ok) {
      setSparks((s) => s - cost);
      setOwned((prev) => [...prev, itemId]);
      setJustBought(itemId);
      playSfx('unlock');
      setTimeout(() => setJustBought(null), 1500);
      onPurchase?.(itemId);
    }
  };

  return (
    <motion.div
      className="shop-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="shop-panel"
        initial={{ scale: 0.92, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      >
        {/* Header */}
        <div className="shop-header">
          <div className="shop-header-left">
            <ShoppingBag size={20} />
            <span className="shop-title">Avatar Shop</span>
          </div>
          <div className="shop-header-right">
            <div className="shop-sparks-display">
              <span className="shop-spark-icon">⚡</span>
              <motion.span
                className="shop-spark-balance"
                key={sparks}
                initial={{ scale: 1.3, color: '#ffd700' }}
                animate={{ scale: 1, color: '#ffc96b' }}
                transition={{ duration: 0.3 }}
              >
                {sparks}
              </motion.span>
              <span className="shop-spark-label">Sparks</span>
            </div>
            <button type="button" className="shop-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="shop-categories">
          {CATEGORIES.map((cat) => (
            <motion.button
              key={cat.id}
              type="button"
              className={`shop-cat-tab ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => { setActiveCategory(cat.id); playSfx('click'); }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Item grid */}
        <div className="shop-items-grid">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              className="shop-items-inner"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {items.map((item, i) => {
                const isOwned = owned.includes(item.id);
                const canAfford = sparks >= item.sparkCost;
                const isNew = justBought === item.id;

                return (
                  <motion.div
                    key={item.id}
                    className={`shop-item ${isOwned ? 'owned' : ''} ${!isOwned && !canAfford ? 'cant-afford' : ''}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onMouseEnter={() => setPreview(item.id)}
                    onMouseLeave={() => setPreview(null)}
                  >
                    {/* Preview swatch */}
                    <div
                      className="shop-item-swatch"
                      style={{
                        background: item.previewGradient ?? item.previewColor ?? 'rgba(93,228,255,0.12)',
                        borderColor: isOwned ? 'var(--cyan)' : preview === item.id ? 'rgba(255,255,255,0.3)' : 'var(--border)',
                      }}
                    >
                      <span className="shop-item-emoji">{item.emoji}</span>
                      {isOwned && (
                        <motion.div
                          className="shop-item-owned-badge"
                          initial={isNew ? { scale: 0 } : { scale: 1 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', damping: 10, stiffness: 200 }}
                        >
                          <Check size={10} />
                        </motion.div>
                      )}
                      {!isOwned && !canAfford && (
                        <div className="shop-item-lock-badge"><Lock size={10} /></div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="shop-item-info">
                      <div className="shop-item-name">{item.name}</div>
                      <div className="shop-item-desc">{item.description}</div>
                    </div>

                    {/* Action */}
                    {isOwned ? (
                      <div className="shop-item-owned-tag">Owned</div>
                    ) : (
                      <motion.button
                        type="button"
                        className={`shop-item-buy-btn ${!canAfford ? 'disabled' : ''}`}
                        onClick={() => handleBuy(item.id, item.sparkCost)}
                        whileHover={canAfford ? { scale: 1.05 } : {}}
                        whileTap={canAfford ? { scale: 0.95 } : {}}
                        disabled={!canAfford}
                      >
                        {item.sparkCost === 0 ? (
                          <span>Free</span>
                        ) : (
                          <>
                            <Zap size={11} />
                            <span>{item.sparkCost}</span>
                          </>
                        )}
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer hint */}
        <div className="shop-footer">
          <Zap size={12} style={{ opacity: 0.5 }} />
          <span>Earn Sparks by completing lessons, challenges, and daily streaks</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
