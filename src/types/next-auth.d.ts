
import "next-auth";
import "next-auth/jwt";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "FRAUD_ANALYST";
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "FRAUD_ANALYST";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "FRAUD_ANALYST";
  }
}
