/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Contact {
  id: string;
  name: string;
  avatar?: string;
  publicKey: string;
  isCloseFriend: boolean;
}

type ContactRow = {
  contactId: string;
  name?: string;
  category?: string;
  contact?: {
    name?: string;
    avatar?: string;
    publicKey?: string;
  } | null;
};

export function CloseFriendsManager({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/users/me/contacts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const list: ContactRow[] = Array.isArray(data.data) ? (data.data as ContactRow[]) : [];

        setContacts(
          list.map((row) => ({
            id: row.contactId,
            name: row.contact?.name || row.name || 'Unknown',
            avatar: row.contact?.avatar || undefined,
            publicKey: row.contact?.publicKey || '',
            isCloseFriend: ['close-friends', 'close_friends'].includes(row.category || ''),
          }))
        );
      } finally {
        setLoading(false);
      }
    };

    load().catch((err) => {
      console.error('[CloseFriends] Failed to load contacts:', err);
      setLoading(false);
    });
  }, [token]);

  const selectedCount = useMemo(
    () => contacts.filter((contact) => contact.isCloseFriend).length,
    [contacts]
  );

  const toggle = (id: string) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === id ? { ...contact, isCloseFriend: !contact.isCloseFriend } : contact
      )
    );
  };

  const save = async () => {
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      const closeFriendIds = contacts
        .filter((contact) => contact.isCloseFriend)
        .map((contact) => contact.id);

      await fetch(`${API_URL}/contacts/close-friends`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ closeFriendIds }),
      });

      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
        <div className="animate-pulse text-emerald-400">Loading contacts...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="text-lg font-bold text-white">Close Friends</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {contacts.length === 0 && (
            <p className="py-8 text-center text-slate-500">No contacts yet</p>
          )}

          {contacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => toggle(contact.id)}
              className={`w-full rounded-xl p-3 text-left transition ${
                contact.isCloseFriend
                  ? 'border border-emerald-800 bg-emerald-900/30'
                  : 'bg-slate-800/50 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-white font-bold">
                  {contact.avatar ? (
                    <img src={contact.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    contact.name[0]
                  )}
                </div>

                <div className="flex-1">
                  <p className="font-medium text-white">{contact.name}</p>
                  {contact.publicKey && (
                    <p className="max-w-[200px] truncate font-mono text-xs text-slate-500">
                      {contact.publicKey.slice(0, 24)}...
                    </p>
                  )}
                </div>

                {contact.isCloseFriend && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                    ✓
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800 p-4">
          <button
            onClick={() => {
              save().catch((err) => console.error('[CloseFriends] Save failed:', err));
            }}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-700"
          >
            {saving ? 'Saving...' : `Save (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
