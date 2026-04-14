import { NextResponse } from "next/server";
import { getSupabaseAdminClient, hashPassword, isCloudSyncEnabled, verifyPassword } from "@/lib/cloud/server";

type CloudAuthPayload =
  | { action: "status" }
  | { action: "login"; username: string; password: string }
  | { action: "register"; username: string; password: string; profileName?: string }
  | { action: "update-profile"; accountId: string; profileName?: string; profileNote?: string };

function toAccountDTO(row: {
  id: string;
  username: string;
  profile_name: string | null;
  profile_note: string | null;
  created_at: string;
  last_login_at: string;
}) {
  return {
    id: row.id,
    username: row.username,
    profileName: row.profile_name ?? row.username,
    profileNote: row.profile_note ?? "",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function POST(request: Request) {
  let payload: CloudAuthPayload;
  try {
    payload = (await request.json()) as CloudAuthPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (payload.action === "status") {
    return NextResponse.json({ ok: true, enabled: isCloudSyncEnabled() });
  }
  if (!isCloudSyncEnabled()) {
    return NextResponse.json({ ok: false, error: "cloud_not_configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdminClient();

  if (payload.action === "login") {
    const { username, password } = payload;
    const { data: row, error } = await supabase
      .from("lab_accounts")
      .select("id, username, password_hash, profile_name, profile_note, created_at, last_login_at")
      .eq("username", username)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }
    if (!row || !verifyPassword(password, row.password_hash)) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }
    const now = new Date().toISOString();
    await supabase.from("lab_accounts").update({ last_login_at: now }).eq("id", row.id);
    return NextResponse.json({
      ok: true,
      account: toAccountDTO({ ...row, last_login_at: now }),
    });
  }

  if (payload.action === "register") {
    const username = payload.username.trim();
    const password = payload.password;
    const profileName = payload.profileName?.trim() || username;
    const now = new Date().toISOString();

    const { data: exists } = await supabase.from("lab_accounts").select("id").eq("username", username).maybeSingle();
    if (exists?.id) {
      return NextResponse.json({ ok: false, error: "username_exists" }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const { data: accountRow, error: insertError } = await supabase
      .from("lab_accounts")
      .insert({
        username,
        password_hash: passwordHash,
        profile_name: profileName,
        profile_note: "",
        created_at: now,
        last_login_at: now,
      })
      .select("id, username, profile_name, profile_note, created_at, last_login_at")
      .single();
    if (insertError || !accountRow) {
      return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
    }
    await supabase.from("lab_snapshots").upsert({ account_id: accountRow.id, snapshot: {}, updated_at: now }, { onConflict: "account_id" });
    return NextResponse.json({ ok: true, account: toAccountDTO(accountRow) });
  }

  const { accountId, profileName, profileNote } = payload;
  const { data: updated, error: updateError } = await supabase
    .from("lab_accounts")
    .update({ profile_name: profileName, profile_note: profileNote })
    .eq("id", accountId)
    .select("id, username, profile_name, profile_note, created_at, last_login_at")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, account: toAccountDTO(updated) });
}
