import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { MESSAGE_TEMPLATES } from "@/config/message-templates";

export const GET = route(async (req) => {
  await requireUser(req, OWNER_ONLY);
  return MESSAGE_TEMPLATES;
});
