// ────────────────────────────────────────────────────────────
// Express request augmentation
// ────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Set by JWT auth middleware */
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
      };
      /** Set by API-key auth middleware */
      project?: {
        id: string;
        name: string;
        apiKey: string;
      };
    }
  }
}

export {};
