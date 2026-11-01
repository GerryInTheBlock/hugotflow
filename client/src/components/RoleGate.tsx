import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { homeRouteFor, type UserRole } from "@/lib/types";

/**
 * Keeps each route group for its own roles. Row Level Security in Supabase is the real
 * protection; this only stops people from landing on screens that are not theirs.
 */
export function RoleGate({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile) return <Redirect href="/" />;
  if (!profile.is_active) return <Redirect href="/(auth)/login" />;
  if (!allow.includes(profile.role)) return <Redirect href={homeRouteFor(profile.role)} />;
  return <>{children}</>;
}
