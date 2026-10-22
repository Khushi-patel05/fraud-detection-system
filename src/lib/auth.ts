
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

interface UserRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "FRAUD_ANALYST";
  is_active: number;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "Email and Password",

      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "admin@fraudguard.demo",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();

        const [rows] = await pool.query<UserRow[]>(
          `SELECT user_id, full_name, email, password_hash, role, is_active
           FROM users
           WHERE email = ?
           LIMIT 1`,
          [email]
        );

        const user = rows[0];

        if (!user || Number(user.is_active) !== 1) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: String(user.user_id),
          name: user.full_name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role =
          token.role === "ADMIN" ? "ADMIN" : "FRAUD_ANALYST";
      }

      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
