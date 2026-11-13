import { requireUser, route } from "@/server/http";

export const GET = route(async (req) => {
  const { user } = await requireUser(req, ["OWNER", "STAFF", "REVIO_ADMIN"]);
  return user;
});
