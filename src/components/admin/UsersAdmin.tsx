import { useCallback, useEffect, useState } from "react";
import { BiKey, BiUserPlus } from "react-icons/bi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import type { Profile } from "@/hooks/use-auth";

type Role = Profile["role"];
type Status = Profile["status"];

export function UsersAdmin({ currentRole }: { currentRole: Role }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    nickname: "",
    role: "player" as "player" | "admin",
    initial_password: "",
  });
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    setUsers((data ?? []) as Profile[]);
    setError(loadError?.message ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      toast.success(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {currentRole === "superadmin" && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BiUserPlus className="size-5 text-brand" />
              Criar usuário convidado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () => callEdgeFunction("admin-create-user", form),
                  "Usuário criado com troca de senha obrigatória.",
                );
              }}
            >
              <Field label="E-mail">
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </Field>
              <Field label="Nome">
                <Input
                  required
                  value={form.display_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, display_name: event.target.value }))
                  }
                />
              </Field>
              <Field label="Apelido">
                <Input
                  required
                  value={form.nickname}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nickname: event.target.value }))
                  }
                />
              </Field>
              <Field label="Role">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as "player" | "admin",
                    }))
                  }
                >
                  <option value="player">Player</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Senha inicial">
                <Input
                  required
                  type="text"
                  minLength={8}
                  value={form.initial_password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, initial_password: event.target.value }))
                  }
                />
              </Field>
              <Button disabled={busy} className="self-end">
                Criar usuário
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}

      <div className="space-y-3">
        {users.map((user) => (
          <Card key={user.id} className="glass-card interactive-card">
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="font-bold">{user.display_name || user.nickname || user.email}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              {currentRole === "admin" ? (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-1">{user.role}</span>
                  <span className="rounded-full bg-muted px-2 py-1">{user.status}</span>
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      value={user.role}
                      disabled={user.role === "superadmin" || busy}
                      onChange={(event) =>
                        void run(
                          () =>
                            callEdgeFunction("admin-manage-user", {
                              user_id: user.id,
                              role: event.target.value,
                            }),
                          "Role atualizada.",
                        )
                      }
                    >
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                      {user.role === "superadmin" && <option value="superadmin">Superadmin</option>}
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      value={user.status}
                      disabled={user.role === "superadmin" || busy}
                      onChange={(event) =>
                        void run(
                          () =>
                            callEdgeFunction("admin-manage-user", {
                              user_id: user.id,
                              status: event.target.value as Status,
                            }),
                          "Status atualizado.",
                        )
                      }
                    >
                      <option value="invited">Convidado</option>
                      <option value="active">Ativo</option>
                      <option value="disabled">Desativado</option>
                    </select>
                  </div>
                  {user.role !== "superadmin" && (
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        minLength={8}
                        placeholder="Nova senha temporária"
                        value={passwords[user.id] ?? ""}
                        onChange={(event) =>
                          setPasswords((current) => ({ ...current, [user.id]: event.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || (passwords[user.id] ?? "").length < 8}
                        onClick={() =>
                          void run(
                            () =>
                              callEdgeFunction("admin-set-temp-password", {
                                user_id: user.id,
                                temporary_password: passwords[user.id],
                              }),
                            "Senha temporária definida.",
                          )
                        }
                      >
                        <BiKey className="size-5" />
                        <span className="sr-only sm:not-sr-only">Redefinir</span>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
