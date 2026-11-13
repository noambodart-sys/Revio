/** Erreur métier : le message est en français et peut être affiché tel quel. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Élément") => new AppError(404, "NOT_FOUND", `${what} introuvable`);
export const forbidden = (msg = "Action non autorisée") => new AppError(403, "FORBIDDEN", msg);
export const badRequest = (code: string, msg: string, details?: Record<string, unknown>) =>
  new AppError(400, code, msg, details);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
