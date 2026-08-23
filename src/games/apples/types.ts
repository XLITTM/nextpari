import type { AppleLevelConfig } from './appleConfig';

export type AppleKind = 'good' | 'bad';
export type ApplePhase = 'betting' | 'playing' | 'lost' | 'cleared';

export interface AppleCell {
  id: string;
  kind: AppleKind;
  revealed: boolean;
  picked: boolean;
}

export interface AppleRow {
  level: number;
  multiplier: number;
  cells: AppleCell[];
}

export type { AppleLevelConfig };
