
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

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const [rows] = await pool.query<TransactionRow[]>(`
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
      ORDER BY transaction_time DESC
      LIMIT 100
    `);

    return NextResponse.json({
      success: true,
      count: rows.length,
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
