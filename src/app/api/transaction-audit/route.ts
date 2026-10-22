
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

export async function GET() {
  const auth = await requireApiAuth();

  if (auth.response) return auth.response;

  try {
    // Fetch the most recent transactions from MySQL.
    const [transactions] = await pool.query<TransactionRow[]>(`
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
      ORDER BY transaction_time DESC
      LIMIT 100
    `);

    // Avoid an unnecessary MongoDB query when no transactions exist.
    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        analyzedCount: 0,
        data: [],
      });
    }

    const client = await clientPromise;
    const database = client.db("fraud_detection_db");

    // Retrieve only the newest risk analysis for each transaction.
    const analyses = await database
      .collection<RiskAnalysisDocument>("risk_analysis")
      .aggregate<LatestAnalysisResult>([
        {
          $match: {
            transactionId: {
              $in: transactions.map((transaction) =>
                Number(transaction.transaction_id)
              ),
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

    const latestAnalysis = new Map<
      number,
      RiskAnalysisDocument
    >();

    for (const item of analyses) {
      latestAnalysis.set(Number(item._id), item.analysis);
    }

    // Combine MySQL transaction details with their latest MongoDB analysis.
    const data = transactions.map((transaction) => ({
      ...transaction,
      riskAnalysis:
        latestAnalysis.get(Number(transaction.transaction_id)) ?? null,
    }));

    return NextResponse.json({
      success: true,
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
