
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import clientPromise from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import type { RowDataPacket } from "mysql2";
import type { Document } from "mongodb";

interface TransactionRow extends RowDataPacket {
  transaction_id: number;
  transaction_reference: string;
  customer_id: number;
  customer_name: string;
  amount: string | number;
  transaction_location: string | null;
  transaction_status: string;
  transaction_time: Date;
  max_normal_amount: string | number | null;
  usual_location: string | null;
}

interface RiskAnalysisDocument extends Document {
  transactionId: number;
  analyzedAt?: Date | string;
}

interface LatestAnalysisResult extends Document {
  _id: number;
  analysis: RiskAnalysisDocument;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();

  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const requestedPage = Number.parseInt(
      searchParams.get("page") ?? "1",
      10
    );

    const requestedPageSize = Number.parseInt(
      searchParams.get("pageSize") ?? "500",
      10
    );

    const page =
      Number.isFinite(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, 500)
        : 500;

    const offset = (page - 1) * pageSize;

    // Get the total number of transactions.
    const [countRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total
      FROM v_transaction_monitoring
    `);

    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    // Fetch the requested transaction page from MySQL.
    const [transactions] = await pool.query<TransactionRow[]>(
      `
        SELECT
          transaction_id,
          transaction_reference,
          customer_id,
          customer_name,
          amount,
          transaction_location,
          transaction_status,
          transaction_time,
          max_normal_amount,
          usual_location
        FROM v_transaction_monitoring
        ORDER BY transaction_time DESC, transaction_id DESC
        LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        page,
        pageSize,
        total,
        totalPages,
        count: 0,
        analyzedCount: 0,
        data: [],
      });
    }

    const client = await clientPromise;
    const database = client.db("fraud_detection_db");

    // Retrieve the latest MongoDB risk analysis for each transaction.
    const transactionIds = transactions.map((transaction) =>
      Number(transaction.transaction_id)
    );

    const analyses = await database
      .collection<RiskAnalysisDocument>("risk_analysis")
      .aggregate<LatestAnalysisResult>([
        {
          $match: {
            transactionId: {
              $in: transactionIds,
            },
          },
        },
        {
          $sort: {
            analyzedAt: -1,
          },
        },
        {
          $group: {
            _id: "$transactionId",
            analysis: {
              $first: "$$ROOT",
            },
          },
        },
      ])
      .toArray();

    const latestAnalysis = new Map<number, RiskAnalysisDocument>();

    for (const item of analyses) {
      latestAnalysis.set(Number(item._id), item.analysis);
    }

    // Combine MySQL transaction details with their MongoDB risk analyses.
    const data = transactions.map((transaction) => ({
      ...transaction,
      riskAnalysis:
        latestAnalysis.get(Number(transaction.transaction_id)) ?? null,
    }));

    return NextResponse.json({
      success: true,
      page,
      pageSize,
      total,
      totalPages,
      count: data.length,
      analyzedCount: data.filter(
        (transaction) => transaction.riskAnalysis !== null
      ).length,
      data,
    });
  } catch (error) {
    console.error("Transaction audit API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve combined transaction audit data.",
      },
      { status: 500 }
    );
  }
}
