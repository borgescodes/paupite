import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type AppRole = "superadmin" | "admin" | "player";

export interface ActorProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  status: "invited" | "active" | "disabled";
}

export function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function authenticate(req: Request): Promise<{
  user: User;
  profile: ActorProfile;
  admin: SupabaseClient;
}> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !serviceRole || !publishableKey) {
    throw new HttpError(500, "Supabase environment is not configured.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Missing authorization.");

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) throw new HttpError(401, "Unauthorized.");

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email,display_name,role,status")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new HttpError(500, profileError.message);
  if (!profile || profile.status !== "active") {
    throw new HttpError(403, "Only active users can perform this action.");
  }

  return { user: userData.user, profile: profile as ActorProfile, admin };
}

export function requireRole(profile: ActorProfile, roles: AppRole[]) {
  if (!roles.includes(profile.role)) {
    throw new HttpError(403, "You do not have permission for this action.");
  }
}

export async function writeAudit(
  admin: SupabaseClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) console.error("audit_log_failed", error.message);
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown) {
  console.error(error);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
}
