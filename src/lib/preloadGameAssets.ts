import { APPLE_CLOVER_PNG, APPLE_RED_PNG } from '@/games/apples/appleAssets';
import { CRYSTAL_BG, CRYSTAL_ICONS } from '@/games/crystal/crystalAssets';

const GAME_ASSET_URLS = [
  CRYSTAL_BG,
  ...Object.values(CRYSTAL_ICONS),
  APPLE_RED_PNG,
  APPLE_CLOVER_PNG,
  '/images/games/apple_forest_bg.png',
  '/images/games/apple_banner.png',
  '/images/games/aviator.png',
  '/images/games/crystal_banner.png',
  '/images/26164.png',
];

let started = false;

export function preloadGameAssets(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const url of GAME_ASSET_URLS) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }
}
