import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import type { Actor } from "./context";

export interface AuditEntry {
  merchantId: string | null;
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  /** Jamais de numéro, de PIN ou de code en clair. */
  metadata?: Prisma.InputJsonValue;
}

export async function audit(tx: Tx, e: AuditEntry) {
  await tx.auditLog.create({
    data: {
      merchantId: e.merchantId,
      actorType: e.actor.type,
      actorUserId: e.actor.type === "USER" ? e.actor.userId : null,
      actorDeviceId: e.actor.type === "DEVICE" ? e.actor.deviceId : null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      reason: e.reason ?? null,
      metadata: e.metadata,
    },
  });
}
