
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";
import type { RowDataPacket } from "mysql2/promise";

// GET: Retrieve audit logs with optional filters and search.
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const actionType = searchParams.get("actionType")?.trim() ?? "";
    const entityType = searchParams.get("entityType")?.trim() ?? "";
    const search = searchParams.get("search")?.trim() ?? "";

    const requestedLimit = Number(searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
      : 100;

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (actionType) {
      conditions.push("al.action_type = ?");
      values.push(actionType);
    }

    if (entityType) {
      conditions.push("al.entity_type = ?");
      values.push(entityType);
    }

    if (search) {
      conditions.push(`(
        al.action_type LIKE ?
        OR al.entity_type LIKE ?
        OR al.entity_id LIKE ?
        OR CAST(al.details AS CHAR) LIKE ?
        OR u.full_name LIKE ?
      )`);

      const term = `%${search}%`;
      values.push(term, term, term, term, term);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         al.log_id,
         al.user_id,
         al.action_type,
         al.entity_type,
         al.entity_id,
         al.details,
         al.created_at,
         u.full_name AS user_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${whereClause}
       ORDER BY al.log_id DESC
       LIMIT ?`,
      [...values, limit]
    );

    const logs = rows.map((row) => {
      let details = row.details;

      if (typeof details === "string") {
        try {
          details = JSON.parse(details);
        } catch {
          // Preserve the original value if it is not valid JSON.
        }
      }

      return {
        ...row,
        details,
      };
    });

    return NextResponse.json({
      success: true,
      count: logs.length,
      limit,
      logs,
    });
  } catch (error) {
    console.error("GET audit logs error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch audit logs.",
      },
      { status: 500 }
    );
  }
}
