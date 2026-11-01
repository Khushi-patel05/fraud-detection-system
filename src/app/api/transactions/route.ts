
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";
import type { RowDataPacket } from "mysql2";

interface TransactionRow extends RowDataPacket {
  transaction_id: number;
  transaction_reference: string;
  customer_id: number;
  customer_name: string;
  account_number: string;
  transaction_type: "DEBIT" | "CREDIT";
  amount: string | number;
  merchant: string | null;
  transaction_location: string | null;
  transaction_status: string;
  transaction_time: Date;
  avg_transaction_amount: string | number | null;
  max_normal_amount: string | number | null;
  usual_location: string | null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const requestedLimit = Number(searchParams.get("limit") ?? 100);
    const requestedOffset = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(500, Math.max(1, Math.floor(requestedLimit)))
      : 100;

    const offset = Number.isFinite(requestedOffset)
      ? Math.min(1_000_000, Math.max(0, Math.floor(requestedOffset)))
      : 0;

    const [rows] = await pool.query<TransactionRow[]>(
      `
        SELECT
          transaction_id,
          transaction_reference,
          customer_id,
          customer_name,
          account_number,
          transaction_type,
          amount,
          merchant,
          transaction_location,
          transaction_status,
          transaction_time,
          avg_transaction_amount,
          max_normal_amount,
          usual_location
        FROM v_transaction_monitoring
        ORDER BY transaction_time DESC, transaction_id DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );

    const [countRows] = await pool.query<
      (RowDataPacket & { total: number })[]
    >(`
      SELECT COUNT(*) AS total
      FROM v_transaction_monitoring
    `);

    const total = Number(countRows[0].total);

    return NextResponse.json({
      success: true,
      count: rows.length,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      data: rows,
    });
  } catch (error) {
    console.error("Transactions API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve transactions.",
      },
      { status: 500 }
    );
  }
}
