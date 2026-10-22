
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth, requireAdmin } from "@/lib/api-auth";
import type { RowDataPacket } from "mysql2";

type UserRow = RowDataPacket & {
  user_id: number;
  full_name: string;
  email: string;
  role: "ADMIN" | "FRAUD_ANALYST";
  is_active: number;
};

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  // Only administrators can retrieve the user directory.
  const adminError = requireAdmin(auth.session!.user.role);
  if (adminError) return adminError;

  try {
    const [rows] = await pool.query<UserRow[]>(
      `SELECT user_id, full_name, email, role, is_active
       FROM users
       WHERE is_active = 1
       ORDER BY
         CASE WHEN role = 'FRAUD_ANALYST' THEN 0 ELSE 1 END,
         full_name`
    );

    return NextResponse.json({
      success: true,
      count: rows.length,
      users: rows,
    });
  } catch (error) {
    console.error("Failed to load users:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load active users from MySQL.",
      },
      { status: 500 }
    );
  }
}
