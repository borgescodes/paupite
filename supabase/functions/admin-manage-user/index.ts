import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
  writeAudit,
} from "../_shared/paupite.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    requireRole(profile, ["superadmin"]);
    const body = (await req.json()) as {
      user_id?: string;
      role?: "admin" | "player";
      status?: "invited" | "active" | "disabled";
    };
    if (!body.user_id) throw new HttpError(400, "Informe o usuário.");
    if (!body.role && !body.status) throw new HttpError(400, "Nenhuma alteração informada.");
    if (body.user_id === profile.id)
      throw new HttpError(403, "Use o perfil para alterar seus próprios dados.");

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id,role,status")
      .eq("id", body.user_id)
      .maybeSingle();
    if (targetError) throw new HttpError(500, targetError.message);
    if (!target) throw new HttpError(404, "Usuário não encontrado.");
    if (target.role === "superadmin")
      throw new HttpError(403, "O superadmin protegido não pode ser alterado.");

    const patch: Record<string, string> = {};
    if (body.role) patch.role = body.role;
    if (body.status) patch.status = body.status;

    const { error } = await admin.from("profiles").update(patch).eq("id", body.user_id);
    if (error) throw new HttpError(400, error.message);

    await writeAudit(admin, profile.id, "profile.role_status_updated", "profile", body.user_id, {
      before: { role: target.role, status: target.status },
      after: patch,
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
