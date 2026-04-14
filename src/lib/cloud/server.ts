import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isCloudSyncEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Cloud sync is not configured.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, encodedHash: string) {
  const [salt, digest] = encodedHash.split(":");
  if (!salt || !digest) {
    return false;
  }
  const input = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const saved = Buffer.from(digest, "hex");
  if (input.length !== saved.length) {
    return false;
  }
  return timingSafeEqual(input, saved);
}
