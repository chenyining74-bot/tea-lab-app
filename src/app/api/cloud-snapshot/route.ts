import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isCloudSyncEnabled } from "@/lib/cloud/server";

type SnapshotPayload =
  | { action: "load"; accountId: string }
  | { action: "save"; accountId: string; snapshot: Record<string, string> };

export async function POST(request: Request) {
  let payload: SnapshotPayload;
  try {
    payload = (await request.json()) as SnapshotPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  if (!isCloudSyncEnabled()) {
    return NextResponse.json({ ok: false, error: "cloud_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdminClient();

  if (payload.action === "load") {
    const { data, error } = await supabase.from("lab_snapshots").select("snapshot").eq("account_id", payload.accountId).maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, snapshot: (data?.snapshot ?? {}) as Record<string, string> });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("lab_snapshots")
    .upsert({ account_id: payload.accountId, snapshot: payload.snapshot, updated_at: now }, { onConflict: "account_id" });
  if (error) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updatedAt: now });
}
