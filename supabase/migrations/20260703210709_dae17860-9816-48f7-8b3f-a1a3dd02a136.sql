
CREATE OR REPLACE FUNCTION private.dispatch_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, net
AS $$
DECLARE
  fn_url text;
  secret text;
BEGIN
  BEGIN
    SELECT value INTO fn_url FROM private.app_config WHERE key = 'push_dispatch_url';
    SELECT value INTO secret FROM private.app_config WHERE key = 'push_webhook_secret';
    IF fn_url IS NULL OR secret IS NULL THEN
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url := fn_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-webhook-secret', secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push dispatch failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.dispatch_push_for_notification() FROM PUBLIC, anon, authenticated;
