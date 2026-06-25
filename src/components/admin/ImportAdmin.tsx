import { useState } from "react";
import { BiFile, BiUpload } from "react-icons/bi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { callEdgeFunction } from "@/lib/edge";

interface ImportResult {
  import_id: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errors: Array<{ match: string; error: string }>;
}

export function ImportAdmin() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const output = await callEdgeFunction<ImportResult>("import-matches", payload);
      setResult(output);
      toast.success("Agenda processada.");
    } catch (caught) {
      setError(
        caught instanceof SyntaxError
          ? "JSON inválido: verifique a sintaxe do arquivo."
          : caught instanceof Error
            ? caught.message
            : "Falha na importação.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BiFile className="size-5 text-brand" />
          Importar agenda por JSON
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O import cria ou atualiza partidas pelo identificador do arquivo, valida seleções e nunca
          apaga partidas ou palpites existentes.
        </p>
        <Input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button disabled={!file || busy} onClick={() => void upload()}>
          <BiUpload className="size-5" />
          {busy ? "Importando..." : "Validar e importar"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-2 rounded-2xl bg-muted/70 p-4 text-sm">
            <p>
              Criadas: <strong>{result.created_count}</strong> · Atualizadas:{" "}
              <strong>{result.updated_count}</strong> · Ignoradas:{" "}
              <strong>{result.skipped_count}</strong>
            </p>
            {result.errors.map((item) => (
              <p key={`${item.match}-${item.error}`} className="text-xs text-destructive">
                {item.match}: {item.error}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
