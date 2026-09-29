-- Audit entries are append-only. The only permitted UPDATE is the ON DELETE SET NULL cascade from
-- Organization/User, and DELETE is only allowed inside a retention purge transaction that sets
-- adpulse.audit_purge = 'on' via set_config(..., true).
CREATE OR REPLACE FUNCTION adpulse_audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('adpulse.audit_purge', true), '') = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'AuditLog rows are immutable (delete blocked)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."action" IS DISTINCT FROM OLD."action"
     OR NEW."entityType" IS DISTINCT FROM OLD."entityType"
     OR NEW."entityId" IS DISTINCT FROM OLD."entityId"
     OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
     OR NEW."ipAddress" IS DISTINCT FROM OLD."ipAddress"
     OR NEW."userAgent" IS DISTINCT FROM OLD."userAgent"
     OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (NEW."organizationId" IS DISTINCT FROM OLD."organizationId" AND NEW."organizationId" IS NOT NULL)
     OR (NEW."actorId" IS DISTINCT FROM OLD."actorId" AND NEW."actorId" IS NOT NULL) THEN
    RAISE EXCEPTION 'AuditLog rows are immutable (update blocked)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION adpulse_audit_log_guard();
