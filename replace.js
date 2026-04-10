/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const content = fs.readFileSync('d:/Presidium/src/components/messenger/chat-view/chat-view.tsx', 'utf8');

const target1 = `        if (e2eResult.success && e2eResult.encrypted) {
          // Store the encrypted envelope as the message content
          const encryptedContent = JSON.stringify(e2eResult.encrypted);
          const persistPayload = {
            id: msgId,
            chatId: activeChatId,
            content: encryptedContent,
            type: 'text',
            replyTo,
            isEncrypted: true,
          } satisfies Record<string, unknown>;

          // Persist to server (encrypted blob only)
          const persist = await persistMessage(persistPayload);

          // Add to local store with decrypted content for display
          sendMessage(activeChatId, content, { id: msgId, replyTo, status: 'sending' });
          setMessageStatus(activeChatId, msgId, 'sent');

          if (!persist.ok && persist.message) {
            toast.error(persist.message);
            enqueueOutboxTask({
              kind: 'api_persist',
              chatId: activeChatId,
              messageId: msgId,
              payload: persistPayload,
            });
          }
        } else {
          // E2E encryption failed — fall back to plaintext with warning
          setE2eError(e2eResult.error || 'E2E encryption failed');
          toast.warning('Сообщение отправлено без шифрования');

          // Fall through to plaintext flow
          const persistPayload = {
            id: msgId,
            chatId: activeChatId,
            content,
            type: 'text',
            replyTo,
          } satisfies Record<string, unknown>;
          const persist = await persistMessage(persistPayload);
          if (persist.shouldBlock) {
            toast.error(persist.message || t('moderation.messageFlagged'));
            return;
          }`;

const replacement1 = `        if (e2eResult.success && e2eResult.encrypted) {
          // Add to local store with decrypted content for display
          sendMessage(activeChatId, content, { id: msgId, replyTo, status: 'sending' });
          setMessageStatus(activeChatId, msgId, 'sent');
        } else {
          setE2eError(e2eResult.error || 'E2E encryption failed');
          toast.error('Доставка отменена: ошибка шифрования');
          return;
          // E2E is forced, NO plaintext fallback!
        }`;

let result = content.replace(target1, replacement1);

// Normalize text ending to prevent mismatch. Let's try to do it robustly by ripping out chunk dynamically.
function replaceDynamic() {
    let startIdx = result.indexOf('        if (e2eResult.success && e2eResult.encrypted)');
    let endStr = "toast.error(persist.message || t('moderation.messageFlagged'));\\r\\n            return;\\r\\n          }";
    let endStrLF = "toast.error(persist.message || t('moderation.messageFlagged'));\\n            return;\\n          }";
    
    let endIdx = result.indexOf(endStr);
    let offset = endStr.length;
    if(endIdx === -1) {
        endIdx = result.indexOf(endStrLF);
        offset = endStrLF.length;
    }
    
    if (startIdx !== -1 && endIdx !== -1) {
        result = result.substring(0, startIdx) + replacement1 + result.substring(endIdx + offset);
    }
}
replaceDynamic();

fs.writeFileSync('d:/Presidium/src/components/messenger/chat-view/chat-view.tsx', result, 'utf8');
console.log('Replaced');
