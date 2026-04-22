/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { registerPlugin } from '@capacitor/core';

const PresidiumBiometric = registerPlugin<{
  authenticate(): Promise<{ success: boolean; cryptoObject: boolean }>;
  isAvailable(): Promise<{ available: boolean; strong: boolean }>;
}>('PresidiumBiometric');

export const useBiometric = () => {
  return {
    authenticate: () => PresidiumBiometric.authenticate(),
    isAvailable: () => PresidiumBiometric.isAvailable(),
  };
};
