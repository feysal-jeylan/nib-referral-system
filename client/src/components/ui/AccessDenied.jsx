/**
 * components/ui/AccessDenied.jsx
 * ────────────────────────────────
 * Shown when a user navigates to a page they lack permission to view.
 * Uses NIB brand colours and existing Button component.
 * Props:
 *   onGoHome () => void   — callback to navigate back to overview
 */

import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';

export default function AccessDenied({ onGoHome }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6"
      style={{ background: IVORY }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(138,77,31,0.10)' }}
      >
        <ShieldOff size={32} style={{ color: BRAND }} strokeWidth={1.6} />
      </div>

      <h2 className="text-xl font-bold mb-2" style={{ color: CHOCOLATE }}>
        Access Denied
      </h2>
      <p className="text-sm mb-6 max-w-xs" style={{ color: MUTED }}>
        You don't have permission to view this page. Contact your administrator
        if you believe this is an error.
      </p>

      {onGoHome && (
        <Button onClick={onGoHome} variant="outline" size="sm">
          Go to Dashboard
        </Button>
      )}
    </div>
  );
}

