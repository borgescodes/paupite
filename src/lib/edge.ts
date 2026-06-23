import { supabase } from "@/integrations/supabase/client";

export async function callEdgeFunction<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      let message: unknown;
      try {
        const payload = (await context.clone().json()) as { error?: unknown; message?: unknown };
        message = payload.error ?? payload.message;
      } catch {
        message = null;
      }
      if (message) throw new Error(String(message));
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}
