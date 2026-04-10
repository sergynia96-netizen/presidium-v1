/**
 * SafetyNumberVerification
 *
 * Full-screen dialog for verifying safety numbers with a contact.
 * Similar to Signal's safety number verification screen.
 *
 * Features:
 * - Visual fingerprint (7x7 colored grid)
 * - Numeric safety number (6 groups of 5 digits)
 * - QR code display
 * - Manual comparison
 * - Verification confirmation
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Shield,
  ShieldCheck,
  QrCode,
  Hash,
  Copy,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  generateSafetyNumbers,
  generateVisualFingerprint,
  generateQRFingerprint,
  saveTrustRecord,
  type SafetyNumber,
  type TrustRecord,
} from '@/lib/crypto';
import { sessionManager } from '@/lib/crypto';
import { bytesToHex } from '@/lib/crypto/utils';

// ─── Color palette for visual fingerprint ────────────────────────────────────

const FINGERPRINT_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
];

// ─── Types ───────────────────────────────────────────────────────────────────

type VerificationMode = 'visual' | 'numeric' | 'qr';

interface SafetyNumberVerificationProps {
  contactId: string;
  contactName: string;
  isOpen: boolean;
  onClose: () => void;
  onVerified?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SafetyNumberVerification({
  contactId,
  contactName,
  isOpen,
  onClose,
  onVerified,
}: SafetyNumberVerificationProps) {
  const [mode, setMode] = useState<VerificationMode>('visual');
  const [safetyNumber, setSafetyNumber] = useState<SafetyNumber | null>(null);
  const [visualGrid, setVisualGrid] = useState<number[][] | null>(null);
  const [_qrData, setQrData] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function loadSafetyNumber() {
      setIsLoading(true);

      try {
        const identityKeys = sessionManager.getLocalIdentityKeys();
        const session = sessionManager.getSession(contactId);

        if (identityKeys && session?.remoteIdentityKey) {
          const sn = await generateSafetyNumbers(
            identityKeys,
            session.remoteIdentityKey,
          );
          setSafetyNumber(sn);

          // Generate visual fingerprint from remote identity key
          const grid = generateVisualFingerprint(session.remoteIdentityKey);
          setVisualGrid(grid);

          // Generate QR data
          const qr = generateQRFingerprint(contactId, session.remoteIdentityKey);
          setQrData(qr);

          // Check if already verified
          const trustRecords = JSON.parse(
            localStorage.getItem('presidium-trust-records') || '[]',
          ) as TrustRecord[];
          const alreadyVerified = trustRecords.some(
            (r: TrustRecord) => r.userId === contactId && r.identityKey === bytesToHex(session.remoteIdentityKey!),
          );
          setIsVerified(alreadyVerified);
        }
      } catch (error) {
        console.error('[SafetyNumberVerification] Failed to load safety number:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSafetyNumber();
  }, [isOpen, contactId]);

  const handleVerify = () => {
    if (!safetyNumber) return;

    const identityKeys = sessionManager.getLocalIdentityKeys();
    const session = sessionManager.getSession(contactId);

    if (identityKeys && session?.remoteIdentityKey) {
      saveTrustRecord({
        userId: contactId,
        identityKey: bytesToHex(session.remoteIdentityKey),
        verifiedAt: Date.now(),
        verificationMethod: mode === 'qr' ? 'qr-scan' : 'safety-number',
      });

      setIsVerified(true);
      onVerified?.();
    }
  };

  const handleCopy = () => {
    if (safetyNumber) {
      navigator.clipboard.writeText(safetyNumber.combined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Номер безопасности
          </DialogTitle>
          <DialogDescription>
            Сравните этот номер с{' '}
            <span className="font-medium text-foreground">{contactName}</span>{' '}
            для подтверждения шифрования.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          </div>
        ) : (
          <>
            {/* Mode Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setMode('visual')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'visual'
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Shield className="w-4 h-4" />
                Визуальный
              </button>
              <button
                onClick={() => setMode('numeric')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'numeric'
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Hash className="w-4 h-4" />
                Числовой
              </button>
              <button
                onClick={() => setMode('qr')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'qr'
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <QrCode className="w-4 h-4" />
                QR-код
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-col items-center py-4">
              {mode === 'visual' && visualGrid && (
                <div className="flex flex-col items-center gap-4">
                  <div className="grid grid-cols-7 gap-1 p-3 bg-muted/50 rounded-xl">
                    {visualGrid.flat().map((colorIndex, i) => (
                      <div
                        key={i}
                        className={`w-8 h-8 rounded-md ${FINGERPRINT_COLORS[colorIndex]} transition-all duration-300`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Покажите этот узор {contactName} или сравните визуально
                  </p>
                </div>
              )}

              {mode === 'numeric' && safetyNumber && (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="bg-muted/50 rounded-xl p-6 w-full">
                    <p className="text-center font-mono text-lg tracking-wider break-all">
                      {safetyNumber.combined}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Копировать номер
                      </>
                    )}
                  </Button>
                </div>
              )}

              {mode === 'qr' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-xl">
                    {/* QR Code placeholder — in production, use qrcode.react */}
                    <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Попросите {contactName} отсканировать этот QR-код
                  </p>
                </div>
              )}
            </div>

            {/* Verification Status */}
            {isVerified && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Контакт проверен
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {!isVerified && (
                <Button
                  onClick={handleVerify}
                  className="flex-1 gap-2"
                  variant="default"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Подтвердить
                </Button>
              )}
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 gap-2"
              >
                <X className="w-4 h-4" />
                Закрыть
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
