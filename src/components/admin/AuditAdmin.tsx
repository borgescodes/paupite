import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase as _supabaseTyped } from "@/integrations/supabase/client";
const supabase = _supabaseTyped as any;
import type { Json } from "@/integrations/supabase/types";

interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}

export function AuditAdmin() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: loadError }) => {
        setRows((data ?? []) as AuditRow[]);
        setError(loadError?.message ?? null);
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Auditoria crítica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border p-3">
            <p className="text-sm font-bold">{row.action}</p>
            <p className="text-xs text-muted-foreground">
              {row.entity_type} {row.entity_id ? `· ${row.entity_id}` : ""} ·{" "}
              {new Date(row.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
        {!error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
        )}
      </CardContent>
    </Card>
  );
}
