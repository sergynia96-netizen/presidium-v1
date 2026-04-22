/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { CloseFriendsManager } from './CloseFriendsManager';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Privacy = 'everyone' | 'contacts' | 'close-friends' | 'custom';

type ContactOption = {
  id: string;
  name: string;
  avatar?: string;
};

type ContactRow = {
  contactId: string;
  name?: string;
  contact?: {
    name?: string;
    avatar?: string;
  } | null;
};

export function PrivacySelector({
  value,
  onChange,
  allowedUserIds,
  onAllowedUserIdsChange,
}: {
  value: Privacy;
  onChange: (privacy: Privacy) => void;
  allowedUserIds: string[];
  onAllowedUserIdsChange: (ids: string[]) => void;
}) {
  const { token } = useAuth();
  const [showCloseFriends, setShowCloseFriends] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(allowedUserIds);

  const options: Array<{ value: Privacy; label: string; desc: string }> = [
    { value: 'everyone', label: 'Everyone', desc: 'Anyone on Presidium' },
    { value: 'contacts', label: 'Contacts', desc: 'Only people you know' },
    { value: 'close-friends', label: 'Close Friends', desc: 'Your curated list' },
    { value: 'custom', label: 'Custom', desc: 'Select specific people' },
  ];

  useEffect(() => {
    setSelectedIds(allowedUserIds);
  }, [allowedUserIds]);

  const selectedCount = useMemo(() => selectedIds.length, [selectedIds]);

  const loadContacts = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoadingContacts(true);
    try {
      const res = await fetch(`${API_URL}/users/me/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list: ContactRow[] = Array.isArray(data.data) ? (data.data as ContactRow[]) : [];
      setContacts(
        list.map((item) => ({
          id: item.contactId,
          name: item.contact?.name || item.name || 'Unknown',
          avatar: item.contact?.avatar || undefined,
        }))
      );
    } finally {
      setLoadingContacts(false);
    }
  }, [token]);

  const toggleCustomTarget = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => {
            onChange(option.value);
            if (option.value === 'close-friends') {
              setShowCloseFriends(true);
            }
            if (option.value === 'custom') {
              loadContacts()
                .then(() => setShowCustomPicker(true))
                .catch((err) => console.error('[Stories] Contacts load failed:', err));
            }
          }}
          className={`w-full rounded-xl border p-3 text-left transition ${
            value === option.value
              ? 'border-emerald-600 bg-emerald-900/20 text-emerald-400'
              : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{option.label}</p>
              <p className="text-xs opacity-70">{option.desc}</p>
            </div>
            {value === option.value && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                ✓
              </div>
            )}
          </div>
        </button>
      ))}

      {value === 'close-friends' && (
        <button
          onClick={() => setShowCloseFriends(true)}
          className="text-xs text-emerald-400 underline"
        >
          Edit Close Friends list
        </button>
      )}

      {value === 'custom' && (
        <button
          onClick={() => {
            loadContacts()
              .then(() => setShowCustomPicker(true))
              .catch((err) => console.error('[Stories] Contacts load failed:', err));
          }}
          className="text-xs text-emerald-400 underline"
        >
          Select people ({selectedCount})
        </button>
      )}

      {showCloseFriends && <CloseFriendsManager onClose={() => setShowCloseFriends(false)} />}

      {showCustomPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <h3 className="text-lg font-bold text-white">Custom Audience</h3>
              <button onClick={() => setShowCustomPicker(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loadingContacts ? (
                <p className="p-4 text-center text-slate-500">Loading contacts...</p>
              ) : contacts.length === 0 ? (
                <p className="p-4 text-center text-slate-500">No contacts found</p>
              ) : (
                <div className="space-y-1">
                  {contacts.map((contact) => {
                    const selected = selectedIds.includes(contact.id);
                    return (
                      <button
                        key={contact.id}
                        onClick={() => toggleCustomTarget(contact.id)}
                        className={`w-full rounded-xl p-3 text-left transition ${
                          selected
                            ? 'border border-emerald-700 bg-emerald-900/30'
                            : 'bg-slate-800/50 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-white font-bold">
                            {contact.avatar ? (
                              <img src={contact.avatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              contact.name[0]
                            )}
                          </div>
                          <span className="flex-1 text-white">{contact.name}</span>
                          {selected && <span className="text-emerald-400">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 p-4">
              <button
                onClick={() => {
                  onAllowedUserIdsChange(selectedIds);
                  setShowCustomPicker(false);
                }}
                className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500"
              >
                Apply ({selectedCount})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
