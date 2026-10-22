
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth, requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const adminError = requireAdmin(auth.session!.user.role);
  if (adminError) return adminError;

  try {
    await pool.query("SELECT 1");

    return NextResponse.json({
      success: true,
      message: "MySQL connection successful",
    });
  } catch (error) {
    console.error("MySQL connection test failed:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to connect to MySQL. Check server status and environment configuration.",
      },
      { status: 500 }
    );
  }
}
