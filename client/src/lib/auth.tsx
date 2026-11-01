import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { Profile } from "./types";

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  contactNumber: string;
  birthdate: string; // YYYY-MM-DD
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, full_name, email, contact_number, role, pin, photo_url, birthdate, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[auth] profile load failed", error.message);
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(data.session ? await loadProfile(data.session.user.id) : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer the query so it doesn't run inside the auth callback.
      setTimeout(async () => {
        setProfile(next ? await loadProfile(next.user.id) : null);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendly(error.message) : null;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          contact_number: input.contactNumber.trim(),
          birthdate: input.birthdate,
        },
      },
    });
    if (error) return { error: friendly(error.message), needsConfirmation: false };
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return error ? friendly(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await loadProfile(session.user.id));
  }, [session]);

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signUp, resetPassword, signOut, refreshProfile }),
    [session, profile, loading, signIn, signUp, resetPassword, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password.";
  // The database refuses accounts under 16 (users_min_age trigger); Supabase reports it generically.
  if (/aged 16|database error saving new user/i.test(message))
    return "We couldn't create the account. Hugot Gym accepts members aged 16 and above.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first. Check your inbox.";
  if (/already registered/i.test(message)) return "That email already has an account. Try logging in.";
  return message;
}
