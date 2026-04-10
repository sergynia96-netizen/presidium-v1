'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import type { Contact } from '@/types';

export default function NewContact() {
  const { t } = useT();
  const goBack = useAppStore((s) => s.goBack);
  const addContact = useAppStore((s) => s.addContact);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');

  const isFormValid = firstName.trim() !== '' && phone.trim() !== '';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isFormValid) return;

      const newContact: Contact = {
        id: `user-${Date.now()}`,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        avatar: '',
        status: 'offline',
        phone: phone.trim(),
        username: username.trim() || undefined,
        bio: undefined,
      };

      addContact(newContact);
      goBack();
    },
    [firstName, lastName, phone, username, isFormValid, addContact, goBack]
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
                placeholder={t('contact.addPhonePlaceholder')}
                type="tel"
                autoComplete="tel"
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
          <Button
            type="submit"
            disabled={!isFormValid}
            className="h-11 w-full bg-emerald-brand text-white hover:bg-emerald-brand/90 disabled:opacity-40"
          >
            <UserPlus className="size-4 mr-2" />
            {t('contacts.addContact')}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}