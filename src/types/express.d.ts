import type { Types } from "mongoose";

export interface AuthUser {
  id: string;
  _id: Types.ObjectId;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Signed-in website customer (set by `authenticateCustomer`). Never grants admin access. */
      customer?: { id: string; email: string };
      /** Parsed & validated payloads written by the `validate` middleware. */
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
