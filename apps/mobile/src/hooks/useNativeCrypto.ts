/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { registerPlugin } from '@capacitor/core';

const PresidiumCrypto = registerPlugin<{
  generateIdentity(): Promise<{ publicKey: string; exists: boolean }>;
  getIdentity(): Promise<{ publicKey: string; seed: string }>;
  storeRecoveryHint(options: { hint: string }): Promise<void>;
  clearIdentity(): Promise<void>;
}>('PresidiumCrypto');

export const useNativeCrypto = () => {
  return {
    generateIdentity: () => PresidiumCrypto.generateIdentity(),
    getIdentity: () => PresidiumCrypto.getIdentity(),
    storeRecoveryHint: (hint: string) => PresidiumCrypto.storeRecoveryHint({ hint }),
    clearIdentity: () => PresidiumCrypto.clearIdentity(),
  };
};
