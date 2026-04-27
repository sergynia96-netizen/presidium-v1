/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React, { useState } from "react";
import { User, Lock, Bell, Key, Download, Upload, Shield, Eye, Ghost, Building } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../components/Avatar";

type PrivacyTier = "phantom" | "guardian" | "enterprise";

interface Props {
  user: { id: string; email: string; displayName: string; avatarUrl: string | null } | null;
  token: string | null;
}

export default function SettingsPage({ user, token }: Props) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [privacy, setPrivacy] = useState<PrivacyTier>("guardian");
  const [notifs, setNotifs] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("update_profile", { name: displayName });
      setMsg("Profile updated");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) { setMsg(String(e)); }
    setSaving(false);
  };

  const handleExportKeys = async () => {
    try {
      const data = await invoke<string>("export_keys");
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "presidium-keys-backup.json"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setMsg(String(e)); }
  };

  const handleImportKeys = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try { await invoke("import_keys", { data: text }); setMsg("Keys imported"); } catch (err: any) { setMsg(String(err)); }
    };
    input.click();
  };

  const privacyTiers: { id: PrivacyTier; icon: React.ReactNode; name: string; desc: string }[] = [
    { id: "phantom", icon: <Eye size={20} />, name: "Phantom", desc: "Maximum anonymity, no metadata" },
    { id: "guardian", icon: <Shield size={20} />, name: "Guardian", desc: "Balanced privacy and usability" },
    { id: "enterprise", icon: <Building size={20} />, name: "Enterprise", desc: "Full audit log and compliance" },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h2 className="text-xl font-bold text-white">Settings</h2>

        {msg && <div className="bg-emerald-900/50 border border-emerald-700 rounded-lg px-4 py-2 text-sm text-emerald-400">{msg}</div>}

        {/* Profile */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><User size={16} /> Profile</h3>
          <div className="flex items-center gap-4">
            <Avatar name={displayName} size="lg" />
            <div className="flex-1">
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-600" />
              <p className="text-xs text-slate-500 mt-1">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition">{saving ? "Saving..." : "Save"}</button>
        </section>

        {/* Privacy */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Lock size={16} /> Privacy Tier</h3>
          <div className="grid gap-2">
            {privacyTiers.map(t => (
              <button key={t.id} onClick={() => setPrivacy(t.id)}
                className={lex items-center gap-3 p-3 rounded-lg border transition }>
                <span className={privacy === t.id ? "text-emerald-400" : "text-slate-500"}>{t.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-200">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Bell size={16} /> Notifications</h3>
          <label className="flex items-center justify-between"><span className="text-sm text-slate-400">Push notifications</span>
            <input type="checkbox" checked={notifs} onChange={e => setNotifs(e.target.checked)} className="accent-emerald-600" /></label>
          <label className="flex items-center justify-between"><span className="text-sm text-slate-400">Sounds</span>
            <input type="checkbox" checked={sounds} onChange={e => setSounds(e.target.checked)} className="accent-emerald-600" /></label>
        </section>

        {/* Key Management */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Key size={16} /> Key Management</h3>
          <div className="flex gap-2">
            <button onClick={handleExportKeys} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition"><Download size={16} /> Export Keys</button>
            <button onClick={handleImportKeys} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition"><Upload size={16} /> Import Keys</button>
          </div>
        </section>
      </div>
    </div>
  );
}
