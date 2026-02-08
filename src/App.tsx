/**
 * Lost Worlds Combat Book Game
 *
 * Main application component that routes between menu and battle views.
 */

import React from 'react';
import { useGameStore } from './state/gameStore';
import { MenuView } from './ui/components/MenuView';
import { BattleViewNew } from './ui/components/BattleViewNew';

const App: React.FC = () => {
  const { mode } = useGameStore();

  return (
    <div className="bg-gray-900" style={{ minHeight: '100dvh' }}>
      {mode === 'menu' && <MenuView />}
      {(mode === 'battle' || mode === 'gameover') && <BattleViewNew />}
    </div>
  );
};

export default App;
