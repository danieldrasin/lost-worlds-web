/**
 * Character Sheet Component
 *
 * Displays a character's available maneuvers organized by category.
 * Maneuvers are clickable when valid, struck through when restricted.
 */

import React from 'react';
import type { Character, Maneuver, ManeuverCategory } from '../../domain/types';
import { CATEGORY_DISPLAY_NAMES, groupManeuversByCategory } from '../../domain/types/maneuver';
import { getValidMovesForCharacter } from '../../state/gameStore';

interface CharacterSheetProps {
  character: Character;
  selectedManeuver: Maneuver | null;
  onSelectManeuver: (maneuver: Maneuver) => void;
  disabled?: boolean;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  selectedManeuver,
  onSelectManeuver,
  disabled = false,
}) => {
  const validMoves = getValidMovesForCharacter(character);
  const validMoveIds = new Set(validMoves.map(m => m.id));
  const groupedManeuvers = groupManeuversByCategory(character.sheet.maneuvers);

  // Define category order
  const categoryOrder: ManeuverCategory[] = [
    'DOWN_SWING',
    'SIDE_SWING',
    'THRUST',
    'FAKE',
    'PROTECTED_ATTACK',
    'RAGE',
    'SPECIAL',
    'SHIELD_BLOCK',
    'JUMP',
    'EXTENDED_RANGE',
  ];

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-gray-800 text-white px-4 py-2">
        <h3 className="font-bold text-lg">{character.name}</h3>
        <div className="text-sm opacity-80">
          Height: {character.height} | HP: {character.state.bodyPoints}/{character.state.maxBodyPoints}
        </div>
      </div>

      <div className="p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Category</th>
              <th className="border px-2 py-1 text-left">Maneuver</th>
              <th className="border px-2 py-1 text-center w-12">Mod</th>
            </tr>
          </thead>
          <tbody>
            {categoryOrder.map(category => {
              const maneuvers = groupedManeuvers.get(category);
              if (!maneuvers || maneuvers.length === 0) return null;

              return maneuvers.map((maneuver, index) => {
                const isValid = validMoveIds.has(maneuver.id);
                const isSelected = selectedManeuver?.id === maneuver.id;

                return (
                  <tr
                    key={maneuver.id}
                    className={`
                      ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      ${!isValid ? 'opacity-50' : ''}
                    `}
                  >
                    {index === 0 && (
                      <td
                        className="border px-2 py-1 font-medium bg-gray-50"
                        rowSpan={maneuvers.length}
                      >
                        {CATEGORY_DISPLAY_NAMES[category] || category}
                      </td>
                    )}
                    <td
                      className={`border px-2 py-1 cursor-pointer hover:bg-gray-100
                        ${disabled || !isValid ? 'cursor-not-allowed' : ''}
                      `}
                      style={{
                        backgroundColor: isSelected
                          ? getColorValue(maneuver.color, 0.3)
                          : getColorValue(maneuver.color, 0.1),
                      }}
                      onClick={() => {
                        if (!disabled && isValid) {
                          onSelectManeuver(maneuver);
                        }
                      }}
                    >
                      <span
                        style={{
                          textDecoration: isValid ? 'none' : 'line-through',
                          color: getTextColor(maneuver.color),
                        }}
                      >
                        {maneuver.name}
                      </span>
                      <span
                        className="ml-2 px-1 rounded text-xs"
                        style={{
                          backgroundColor: getColorValue(maneuver.color, 1),
                          color: maneuver.color === 'yellow' || maneuver.color === 'white' ? 'black' : 'white',
                        }}
                      >
                        {maneuver.color}
                      </span>
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {maneuver.modifier > 0 ? `+${maneuver.modifier}` : maneuver.modifier}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* Status effects */}
      {character.state.activeRestrictions.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 border-t">
          <div className="text-xs font-medium text-yellow-800">Restrictions:</div>
          {character.state.activeRestrictions.map((r, i) => (
            <div key={i} className="text-xs text-yellow-700">
              • {r.source}
            </div>
          ))}
        </div>
      )}

      {!character.state.hasWeapon && (
        <div className="px-4 py-2 bg-red-50 border-t">
          <div className="text-xs font-medium text-red-800">⚔️ Weapon Lost!</div>
        </div>
      )}
    </div>
  );
};

/**
 * Get CSS color value for a maneuver color
 */
function getColorValue(color: string, opacity: number = 1): string {
  const colors: Record<string, string> = {
    red: `rgba(220, 38, 38, ${opacity})`,
    blue: `rgba(37, 99, 235, ${opacity})`,
    orange: `rgba(234, 88, 12, ${opacity})`,
    green: `rgba(22, 163, 74, ${opacity})`,
    yellow: `rgba(234, 179, 8, ${opacity})`,
    white: `rgba(245, 245, 245, ${opacity})`,
    black: `rgba(31, 41, 55, ${opacity})`,
    brown: `rgba(120, 53, 15, ${opacity})`,
  };
  return colors[color] || `rgba(128, 128, 128, ${opacity})`;
}

/**
 * Get text color for contrast
 */
function getTextColor(color: string): string {
  if (color === 'yellow' || color === 'white') {
    return '#1f2937';
  }
  return '#1f2937';
}

export default CharacterSheet;
