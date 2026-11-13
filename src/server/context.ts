import type { UserRole } from "@prisma/client";

export type Actor =
  | { type: "USER"; userId: string; role: UserRole }
  | { type: "DEVICE"; deviceId: string }
  | { type: "SYSTEM" };

/** Contexte d'un appel métier : le commerce concerné et qui agit. */
export interface Ctx {
  merchantId: string;
  actor: Actor;
}

export const actorUserId = (a: Actor) => (a.type === "USER" ? a.userId : null);
export const actorDeviceId = (a: Actor) => (a.type === "DEVICE" ? a.deviceId : null);
