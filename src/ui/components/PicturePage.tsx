/**
 * Picture Page Component
 *
 * Displays the combat result picture page with placeholder art.
 * Replace the placeholder generation with actual images when available.
 */

import React from 'react';
import type { PicturePageResult } from '../../domain/types';

interface PicturePageProps {
  result: PicturePageResult;
  characterName: string;
  damage?: number;
}

/**
 * Generate a placeholder SVG for a picture page
 */
function generatePlaceholderSVG(title: string, damage: number | null, isExtendedRange: boolean): string {
  // Determine colors based on the result
  let bgColor = '#2d3748';  // gray
  let accentColor = '#4a5568';
  let textColor = '#e2e8f0';

  const titleLower = title.toLowerCase();

  // Color coding based on result type
  if (damage !== null && damage > 0) {
    if (damage >= 5) {
      bgColor = '#742a2a';  // dark red - heavy damage
      accentColor = '#c53030';
    } else if (damage >= 3) {
      bgColor = '#7b341e';  // dark orange - moderate damage
      accentColor = '#dd6b20';
    } else {
      bgColor = '#744210';  // dark yellow - light damage
      accentColor = '#d69e2e';
    }
  } else if (titleLower.includes('block') || titleLower.includes('duck') || titleLower.includes('dodge')) {
    bgColor = '#22543d';  // green - defensive success
    accentColor = '#38a169';
  } else if (titleLower.includes('swing') || titleLower.includes('thrust') || titleLower.includes('attack')) {
    bgColor = '#2a4365';  // blue - attacking
    accentColor = '#3182ce';
  } else if (titleLower.includes('dazed') || titleLower.includes('wound') || titleLower.includes('struck')) {
    bgColor = '#553c9a';  // purple - status effect
    accentColor = '#805ad5';
  }

  // Generate simple action icon based on title
  let icon = '⚔️';
  if (titleLower.includes('block')) icon = '🛡️';
  else if (titleLower.includes('duck')) icon = '⬇️';
  else if (titleLower.includes('dodge')) icon = '↔️';
  else if (titleLower.includes('jump')) icon = '⬆️';
  else if (titleLower.includes('swing')) icon = '🗡️';
  else if (titleLower.includes('thrust')) icon = '🔪';
  else if (titleLower.includes('kick')) icon = '🦵';
  else if (titleLower.includes('wound')) icon = '💔';
  else if (titleLower.includes('dazed')) icon = '💫';
  else if (titleLower.includes('weapon')) icon = '⚔️';
  else if (titleLower.includes('charge')) icon = '🏃';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor}"/>
          <stop offset="100%" style="stop-color:${accentColor}"/>
        </linearGradient>
      </defs>
      <rect width="200" height="150" fill="url(#bg)" rx="8"/>
      <rect x="5" y="5" width="190" height="140" fill="none" stroke="${accentColor}" stroke-width="2" rx="6"/>
      <text x="100" y="70" text-anchor="middle" font-size="40">${icon}</text>
      <text x="100" y="105" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${textColor}" font-weight="bold">${title}</text>
      ${damage !== null && damage > 0 ? `<text x="100" y="125" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#fc8181" font-weight="bold">-${damage} HP</text>` : ''}
      ${isExtendedRange ? `<text x="180" y="20" text-anchor="end" font-family="Arial, sans-serif" font-size="10" fill="#fbd38d">EXTENDED</text>` : ''}
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

export const PicturePage: React.FC<PicturePageProps> = ({ result, characterName, damage }) => {
  const imageUrl = result.imageUrl || generatePlaceholderSVG(
    result.title,
    result.damage,
    result.isExtendedRange
  );

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
      <div className="p-2 bg-gray-700 text-center">
        <span className="text-white font-bold text-sm">{characterName}</span>
      </div>
      <img
        src={imageUrl}
        alt={result.title}
        className="w-full h-auto"
      />
      <div className="p-3 text-center">
        <h3 className="text-white font-bold">{result.title}</h3>
        {damage !== undefined && damage > 0 && (
          <p className="text-red-400 font-bold text-lg">Takes {damage} damage!</p>
        )}
        {result.restriction && result.restriction.type !== 'NONE' && (
          <p className="text-yellow-400 text-sm mt-1">
            ⚠️ Movement restricted next turn
          </p>
        )}
      </div>
    </div>
  );
};

export default PicturePage;
