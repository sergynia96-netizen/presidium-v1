/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React, { useState } from "react";
import { Shield, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { KeyPair } from "../hooks/useCrypto";

interface Props {
  onAuth: (token: string, user: any) => void;
}

export default function LoginPage({ onAuth }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyStatus, setKeyStatus] = useState("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      setKeyStatus("generating");
      const keys = await invoke<KeyPair>("generate_keys");
      setKeyStatus("keys_ready");

      const endpoint = isRegister ? "register" : "login";
      const payload = isRegister ? { email, password, displayName } : { email, password };
      const result = await invoke<{ token: string; user: any }>(endpoint, payload);

      localStorage.setItem("presidium_token", result.token);
      localStorage.setItem("presidium_user", JSON.stringify(result.user));
      onAuth(result.token, result.user);
    } catch (err: any) {
      setError(String(err));
      setKeyStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Presidium</h1>
          <p className="text-slate-500 text-sm mt-1">Sovereign Encrypted Messenger</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">{isRegister ? "Create Account" : "Sign In"}</h2>

          {isRegister && (
            <div className="relative">
              <User size={16} className="absolute left-3 top-3 text-slate-500" />
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" required
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600" />
            </div>
          )}

          <div className="relative">
            <Mail size={16} className="absolute left-3 top-3 text-slate-500" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600" />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-3 top-3 text-slate-500" />
            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-500">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-rose-500 text-sm">{error}</p>}

          {keyStatus === "generating" && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              Generating encryption keys...
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded-lg transition">
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
          </button>

          <button type="button" onClick={() => { setIsRegister(!isRegister); setError(""); }}
            className="w-full text-slate-500 hover:text-slate-300 text-sm transition">
            {isRegister ? "Already have an account? Sign in" : "Don't have an account? Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
