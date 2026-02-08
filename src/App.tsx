/**
 * Lost Worlds Combat Book Game
 *
 * Main application component that routes between menu and battle views.
 */

import React from 'react';
import { useGameStore } from './state/gameStore';
import { MenuView } from './ui/components/MenuView';
import { BattleViewNew } from './ui/components/BattleViewNew';

const buildTime = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

const BuildInfo: React.FC = () => {
  if (!buildTime) return null;
  const d = new Date(buildTime);
  const label = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="fixed bottom-1 right-2 text-gray-600 text-xs opacity-50 pointer-events-none select-none z-50">
      build {label}
    </div>
  );
};

const App: React.FC = () => {
  const { mode } = useGameStore();

  return (
    <div className="bg-gray-900" style={{ minHeight: '100dvh' }}>
      {mode === 'menu' && <MenuView />}
      {(mode === 'battle' || mode === 'gameover') && <BattleViewNew />}
      <BuildInfo />
    </div>
  );
};

export default App;
