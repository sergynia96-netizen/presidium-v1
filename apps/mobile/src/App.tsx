/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { useEffect, useState } from 'react';
import { StatusBar } from '@capacitor/status-bar';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useNativeCrypto } from './hooks/useNativeCrypto';
import { useBiometric } from './hooks/useBiometric';
import { usePushNotifications } from './hooks/usePushNotifications';

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string>('');

  const crypto = useNativeCrypto();
  const biometric = useBiometric();
  const push = usePushNotifications();

  useEffect(() => {
    StatusBar.setBackgroundColor({ color: '#0f172a' });
    void initVault();
    void initPush();
  }, []);

  const initVault = async () => {
    try {
      const identity = await crypto.generateIdentity();
      setPublicKey(identity.publicKey);
      if (!identity.exists) {
        const avail = await biometric.isAvailable();
        if (avail.available) {
          await biometric.authenticate();
        }
      }
    } catch (e) {
      console.error('Vault init failed:', e);
    }
  };

  const initPush = async () => {
    await push.init();
    const token = await push.getNativeToken();
    if (token) {
      setPushToken(`${token.provider}: ${token.token.slice(0, 16)}...`);
    }
  };

  const unlock = async () => {
    try {
      const result = await biometric.authenticate();
      if (result.success) {
        setUnlocked(true);
      }
    } catch (e) {
      console.error('Unlock failed:', e);
    }
  };

  const takePhoto = async () => {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });
    console.log('Story photo:', image.webPath);
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-2xl bg-emerald-900/30 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Presidium Vault</h1>
        <p className="text-slate-400 text-center mb-8">Authenticate to access encrypted messages</p>
        <button
          onClick={unlock}
          className="w-full max-w-xs bg-emerald-600 active:bg-emerald-700 text-white font-semibold py-4 rounded-xl transition"
        >
          Unlock with Biometrics
        </button>
        {publicKey && (
          <p className="mt-6 text-[10px] text-slate-600 font-mono break-all max-w-xs text-center">
            {publicKey}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <h1 className="font-bold text-lg">Presidium</h1>
        <div className="flex gap-3">
          <button onClick={takePhoto} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700">
            📷
          </button>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mb-4">
          <h2 className="text-sm font-bold text-emerald-400 mb-1">Secure Connection</h2>
          <p className="text-xs text-slate-400">E2EE keys stored in hardware-backed keystore</p>
          {pushToken && <p className="text-[10px] text-slate-600 mt-2 font-mono">{pushToken}</p>}
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-slate-800 rounded w-1/3 mb-2" />
                <div className="h-3 bg-slate-800/50 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex justify-around text-xs text-slate-500">
        <span className="text-emerald-400 font-medium">Chats</span>
        <span>Stories</span>
        <span>Calls</span>
        <span>Settings</span>
      </nav>
    </div>
  );
}
