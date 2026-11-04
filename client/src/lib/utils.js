/**
 * client/src/lib/utils.js
 * ────────────────────────
 * Utility helpers for composing Tailwind class names.
 *
 * cn(...inputs)
 * ─────────────
 * Combines clsx (conditional class logic) with tailwind-merge (deduplication
 * of conflicting Tailwind utilities). This is the standard shadcn/ui helper
 * and is used by every component that needs dynamic class composition.
 *
 * Example usage:
 *   import { cn } from '@/lib/utils';
 *
 *   // Simple merge:
 *   cn('bg-navy text-white', 'px-4 py-2')
 *   // → 'bg-navy text-white px-4 py-2'
 *
 *   // Conditional (clsx):
 *   cn('btn', isActive && 'bg-navy', isDisabled && 'opacity-50 cursor-not-allowed')
 *   // → 'btn bg-navy' or 'btn opacity-50 cursor-not-allowed'
 *
 *   // Conflict resolution (tailwind-merge):
 *   cn('px-4', 'px-6')
 *   // → 'px-6'   ← tailwind-merge keeps the last conflicting class
 *
 *   // Object syntax (clsx):
 *   cn({ 'bg-navy': isAdmin, 'bg-gold': !isAdmin })
 *   // → 'bg-navy' or 'bg-gold'
 *
 * Dependencies:
 *   clsx           — conditional class string builder
 *   tailwind-merge — Tailwind-aware class conflict resolver
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * @param {...(string|string[]|Record<string,boolean>|undefined|null|false)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
