
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
  transactionReference: string;
  customerId: number;
  customerName: string;
  amount: number;
  location: string | null;
  transactionStatus: string;
  riskScore: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  analyzedAt: Date;
}

function analyzeTransaction(transaction: TransactionRow) {
  const amount = Number(transaction.amount);
  const normalLimit = Number(transaction.max_normal_amount ?? 0);

  // Do not silently classify invalid amounts as low risk.
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      riskScore: 0,
      riskLevel: "LOW" as const,
      reasons: ["Transaction amount is invalid; manual review is required"],
      dataQualityIssue: true,
    };
  }

  const location =
    transaction.transaction_location?.trim().toLowerCase() ?? "";
  const usualLocation =
    transaction.usual_location?.trim().toLowerCase() ?? "";

  let riskScore = 0;
  const reasons: string[] = [];
  let dataQualityIssue = false;

  if (!Number.isFinite(normalLimit) || normalLimit < 0) {
    dataQualityIssue = true;
    reasons.push("Normal spending limit is missing or invalid");
  } else if (normalLimit > 0 && amount > normalLimit) {
    const ratio = amount / normalLimit;

    if (ratio >= 5) {
      riskScore += 50;
      reasons.push(
        "Transaction amount is at least 5 times the normal spending limit"
      );
    } else if (ratio >= 3) {
      riskScore += 35;
      reasons.push(
        "Transaction amount is at least 3 times the normal spending limit"
      );
    } else if (ratio >= 2) {
      riskScore += 25;
      reasons.push(
        "Transaction amount is at least 2 times the normal spending limit"
      );
    } else {
      riskScore += 15;
      reasons.push(
        "Transaction amount exceeds the normal spending limit"
      );
    }
  }

  if (location && usualLocation && location !== usualLocation) {
    riskScore += 30;
    reasons.push(
      "Transaction location differs from the customer's usual location"
    );
  }

  if (!location || !usualLocation) {
    dataQualityIssue = true;
    reasons.push(
      "Transaction location or usual location is unavailable"
    );
  }

  riskScore = Math.min(riskScore, 100);

  const riskLevel =
    riskScore >= 70 ? "HIGH" as const :
    riskScore >= 40 ? "MEDIUM" as const :
    "LOW" as const;

  if (reasons.length === 0) {
    reasons.push(
      "No configured amount or location risk rules were triggered"
    );
  }

  return { riskScore, riskLevel, reasons, dataQualityIssue };
}

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
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

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No transactions available for risk analysis.",
        count: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        dataQualityIssueCount: 0,
        data: [],
      });
    }

    const client = await clientPromise;
    const database = client.db("fraud_detection_db");
    const collection =
      database.collection<RiskAnalysisDocument>("risk_analysis");

    const analyzedAt = new Date();

    const results = transactions.map((transaction) => {
      const analysis = analyzeTransaction(transaction);

      return {
        transactionId: Number(transaction.transaction_id),
        transactionReference: transaction.transaction_reference,
        customerId: Number(transaction.customer_id),
        customerName: transaction.customer_name,
        amount: Number(transaction.amount),
        location: transaction.transaction_location,
        transactionStatus: transaction.transaction_status,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        reasons: analysis.reasons,
        dataQualityIssue: analysis.dataQualityIssue,
        analyzedAt,
      };
    });

    // Upsert one current analysis per transaction in a single bulk operation.
    await collection.bulkWrite(
      results.map((document) => ({
        updateOne: {
          filter: { transactionId: document.transactionId },
          update: { $set: document },
          upsert: true,
        },
      })),
      { ordered: true }
    );

    return NextResponse.json({
      success: true,
      message: "Automatic transaction risk analysis completed.",
      count: results.length,
      highRiskCount: results.filter(
        (item) => item.riskLevel === "HIGH"
      ).length,
      mediumRiskCount: results.filter(
        (item) => item.riskLevel === "MEDIUM"
      ).length,
      lowRiskCount: results.filter(
        (item) => item.riskLevel === "LOW"
      ).length,
      dataQualityIssueCount: results.filter(
        (item) => item.dataQualityIssue
      ).length,
      data: results,
    });
  } catch (error) {
    console.error("Automatic risk analysis failed:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to complete automatic risk analysis. Check the database connections and server logs.",
      },
      { status: 500 }
    );
  }
}
