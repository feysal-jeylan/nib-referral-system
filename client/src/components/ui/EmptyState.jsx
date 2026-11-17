/**
 * components/ui/EmptyState.jsx
 * ─────────────────────────────
 * Centred empty-state placeholder with polymorphic icon support:
 *   - string emojis / symbols (e.g., "🏦", "📋")
 *   - pre-rendered JSX elements (e.g., <Users />)
 *   - raw React component references / forwardRef icons (e.g., Users, UserCog, Shield)
 *
 * Props:
 *   icon        {string | Component | ReactNode} — emoji, icon component, or JSX
 *   title       {string} — primary message
 *   sub         {string} — secondary hint
 *   description {string} — alias for sub
 */

import { isValidElement } from 'react';

const BRAND = '#8A4D1F';

export default function EmptyState({ icon: Icon, title, sub, description, children }) {
  const subtitle = sub || description;

  function renderIcon() {
    if (!Icon) return null;

    // 1. String (e.g. "🏦", "📋")
    if (typeof Icon === 'string') {
      return <span className="text-4xl" aria-hidden="true">{Icon}</span>;
    }

    // 2. Already rendered React element (e.g. <Users />)
    if (isValidElement(Icon)) {
      return Icon;
    }

    // 3. React component reference (e.g. Users, forwardRef object from lucide-react)
    if (
      typeof Icon === 'function' ||
      (typeof Icon === 'object' && Icon !== null && (Icon.$$typeof || Icon.render))
    ) {
      return <Icon size={32} strokeWidth={1.8} style={{ color: BRAND }} aria-hidden="true" />;
    }

    // 4. Undefined or invalid
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      {renderIcon()}
      {title && <p className="text-text-1 font-semibold text-sm">{title}</p>}
      {subtitle && <p className="text-text-3 text-xs max-w-[36ch] leading-relaxed">{subtitle}</p>}
      {children}
    </div>
  );
}
