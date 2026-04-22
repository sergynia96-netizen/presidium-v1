/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const PresidiumPush = registerPlugin<{
  getToken(): Promise<{ token: string; provider: string }>;
  requestPermissions(): Promise<{ granted: boolean }>;
}>('PresidiumPush');

export const usePushNotifications = () => {
  const init = async () => {
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      await PushNotifications.register();
    }
    return result;
  };

  const getNativeToken = async () => {
    try {
      return await PresidiumPush.getToken();
    } catch {
      return null;
    }
  };

  return { init, getNativeToken };
};
