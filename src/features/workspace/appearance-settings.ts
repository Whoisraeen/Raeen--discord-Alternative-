export type AppearanceSettings = {
  effect: string;
  intensity: number;
  enabled: boolean;
  compact: boolean;
  accent: string;
};
export const defaultAppearance: AppearanceSettings = {
  effect: 'None',
  intensity: 35,
  enabled: true,
  compact: false,
  accent: 'mint',
};
