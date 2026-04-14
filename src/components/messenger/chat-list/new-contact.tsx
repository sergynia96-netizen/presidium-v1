'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useApiStore } from '@/store/use-api-store';
import { chatsApi, contactsApi } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import type { Contact } from '@/types';

export default function NewContact() {
  const { t } = useT();
  const goBack = useAppStore((s) => s.goBack);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const setView = useAppStore((s) => s.setView);
  const syncContacts = useApiStore((s) => s.syncContacts);
  const syncChats = useApiStore((s) => s.syncChats);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = username.trim() !== '' || phone.trim() !== '';

  const normalizePhone = (value: string): string => value.replace(/\D/g, '');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isFormValid) return;

      if (isSubmitting) return;

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const usernameQuery = username.trim().replace(/^@+/, '').toLowerCase();
        const phoneOrEmailQuery = phone.trim();
        const searchTerm = usernameQuery || phoneOrEmailQuery;

        if (!searchTerm) {
          throw new Error('Укажите username, email или номер телефона');
        }

        const customDisplayName = `${firstName.trim()} ${lastName.trim()}`.trim();
        const emailQuery = phoneOrEmailQuery.includes('@') ? phoneOrEmailQuery : '';
        const phoneQuery = !emailQuery ? phoneOrEmailQuery : '';

        let apiContact: Record<string, unknown> | undefined;
        try {
          const addResponse = await contactsApi.add({
            username: usernameQuery || undefined,
            email: emailQuery || undefined,
            phone: phoneQuery || undefined,
            query: searchTerm,
            name: customDisplayName || undefined,
          });
          apiContact =
            (addResponse as { contact?: Record<string, unknown> }).contact ||
            (addResponse as { data?: { contact?: Record<string, unknown> } }).data?.contact;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!/already exists/i.test(message)) {
            throw error;
          }

          const contactsResponse = await contactsApi.list(false, searchTerm);
          const contacts =
            (contactsResponse as { contacts?: Array<Record<string, unknown>> }).contacts ||
            (contactsResponse as { data?: { contacts?: Array<Record<string, unknown>> } }).data?.contacts ||
            [];

          const normalizedPhoneQuery = normalizePhone(phoneQuery);
          apiContact =
            contacts.find((entry) => {
              const nested = (entry.contact as Record<string, unknown>) || {};
              const entryUsername = String(nested.username || '').toLowerCase().replace(/^@+/, '');
              const entryEmail = String(nested.email || '').toLowerCase();
              const entryPhone = normalizePhone(String(nested.phone || ''));

              if (usernameQuery && entryUsername === usernameQuery) return true;
              if (emailQuery && entryEmail === emailQuery.toLowerCase()) return true;
              if (normalizedPhoneQuery && entryPhone === normalizedPhoneQuery) return true;
              return false;
            }) ||
            undefined;
        }

        const contactId =
          (typeof apiContact?.contactId === 'string' && apiContact.contactId) ||
          (((apiContact?.contact as Record<string, unknown> | undefined)?.id as string | undefined) || '');

        if (!contactId) {
          throw new Error('Пользователь не найден');
        }

        const apiContactUser = (apiContact?.contact as Record<string, unknown>) || {};
        const resolvedStatus = apiContactUser.status || 'offline';
        const newContact: Contact = {
          id:
            (typeof apiContact?.contactId === 'string' && apiContact.contactId) ||
            contactId,
          name:
            (typeof apiContactUser.displayName === 'string' && apiContactUser.displayName) ||
            (typeof apiContact?.customName === 'string' && apiContact.customName) ||
            customDisplayName ||
            (typeof apiContactUser.name === 'string' && apiContactUser.name) ||
            (typeof apiContactUser.email === 'string' && apiContactUser.email) ||
            searchTerm,
          avatar:
            (typeof apiContactUser.avatar === 'string' && apiContactUser.avatar) ||
            '',
          status: (resolvedStatus === 'online' || resolvedStatus === 'away' ? resolvedStatus : 'offline') as Contact['status'],
          username:
            (typeof apiContactUser.username === 'string' && apiContactUser.username) ||
            undefined,
          phone:
            (typeof apiContactUser.phone === 'string' && apiContactUser.phone) ||
            undefined,
          isFavorite: Boolean(apiContact?.isFavorite),
        };

        useAppStore.setState((state) => {
          if (state.contacts.some((contact) => contact.id === newContact.id)) {
            return state;
          }
          return { contacts: [newContact, ...state.contacts] };
        });

        const chatResponse = await chatsApi.create({
          name: newContact.name,
          type: 'private',
          memberIds: [contactId],
          isEncrypted: true,
          encryptionType: 'e2e',
        });

        const chatId =
          (chatResponse as { chat?: { id?: string } }).chat?.id ||
          (chatResponse as { data?: { chat?: { id?: string } } }).data?.chat?.id ||
          null;

        await Promise.all([syncContacts(), syncChats()]);

        if (chatId) {
          setActiveChat(chatId);
          setView('chat');
          return;
        }

        goBack();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось добавить контакт';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      firstName,
      goBack,
      isFormValid,
      isSubmitting,
      lastName,
      phone,
      setActiveChat,
      setView,
      syncChats,
      syncContacts,
      username,
    ],
  );

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 250 }}
      className="absolute inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-background/95 px-3 py-2.5 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={goBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="flex-1 text-sm font-semibold">{t('contacts.addContact')}</h1>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="flex-1 px-4 py-6">
          {/* Avatar preview */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-6 flex justify-center"
          >
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-brand/10">
              <UserPlus className="size-8 text-emerald-brand" />
            </div>
          </motion.div>

          {/* Form fields */}
          <div className="flex flex-col gap-5">
            {/* First Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName" className="text-sm font-medium text-muted-foreground">
                {t('contact.addFirstName')}
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                autoComplete="given-name"
                className="h-11"
              />
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName" className="text-sm font-medium text-muted-foreground">
                {t('contact.addLastName')}
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                autoComplete="family-name"
                className="h-11"
              />
            </div>

            <Separator />

            {/* Phone number */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" className="text-sm font-medium text-muted-foreground">
                {t('contact.addPhone')}
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Email or phone"
                type="text"
                autoComplete="email tel"
                className="h-11"
              />
            </div>

            <Separator />

            {/* Username (optional) */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username" className="text-sm font-medium text-muted-foreground">
                {t('upc.username')}{' '}
                <span className="text-xs text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
                autoComplete="username"
                className="h-11"
              />
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="shrink-0 border-t px-4 py-4">
          {submitError && (
            <p className="mb-3 text-sm text-destructive">{submitError}</p>
          )}

          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="h-11 w-full bg-emerald-brand text-white hover:bg-emerald-brand/90 disabled:opacity-40"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="size-4 mr-2" />
            )}
            {isSubmitting ? 'Adding...' : t('contacts.addContact')}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
