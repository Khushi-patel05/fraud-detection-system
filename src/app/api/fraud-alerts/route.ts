
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";
import type {
  RowDataPacket,
  ResultSetHeader,
  PoolConnection,
} from "mysql2/promise";

interface FraudAlertRow extends RowDataPacket {
  alert_id: number;
  transaction_id: number;
  risk_score: number | string;
  risk_level: string;
  alert_reason: unknown;
  alert_status: string;
  created_at: Date;
  resolved_at: Date | null;
  transaction_reference: string;
  amount: number | string;
  transaction_location: string | null;
  customer_name: string;
  customer_id: number;
  assigned_analyst: string | null;
}

interface ExistingAlertRow extends RowDataPacket {
  alert_id: number;
  alert_status: string;
}

interface LinkedCaseRow extends RowDataPacket {
  case_id: number;
  case_status: string;
}

const ALLOWED_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "CLOSED",
] as const;

type AlertStatus = (typeof ALLOWED_STATUSES)[number];

const FINAL_STATUSES: readonly AlertStatus[] = [
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "CLOSED",
];

function parsePositiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isAlertStatus(value: unknown): value is AlertStatus {
  return (
    typeof value === "string" &&
    (ALLOWED_STATUSES as readonly string[]).includes(value)
  );
}

async function rollbackQuietly(connection: PoolConnection) {
  try {
    await connection.rollback();
  } catch (error) {
    console.error("Fraud alert rollback failed:", error);
  }
}

// GET: List fraud alerts.
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const [rows] = await pool.query<FraudAlertRow[]>(`
      SELECT
        fa.alert_id,
        fa.transaction_id,
        fa.risk_score,
        fa.risk_level,
        fa.alert_reason,
        fa.alert_status,
        fa.created_at,
        fa.resolved_at,
        t.transaction_reference,
        t.amount,
        t.transaction_location,
        c.full_name AS customer_name,
        c.customer_id,
        u.full_name AS assigned_analyst
      FROM fraud_alerts AS fa
      INNER JOIN transactions AS t
        ON fa.transaction_id = t.transaction_id
      INNER JOIN accounts AS a
        ON t.account_id = a.account_id
      INNER JOIN customers AS c
        ON a.customer_id = c.customer_id
      LEFT JOIN users AS u
        ON fa.assigned_to = u.user_id
      ORDER BY
        CASE
          WHEN fa.risk_level = 'CRITICAL' THEN 1
          WHEN fa.risk_level = 'HIGH' THEN 2
          WHEN fa.risk_level = 'MEDIUM' THEN 3
          ELSE 4
        END,
        fa.created_at DESC
      LIMIT 200
    `);

    const data = rows.map((row) => {
      let parsedReason = row.alert_reason;

      if (typeof parsedReason === "string") {
        try {
          parsedReason = JSON.parse(parsedReason);
        } catch {
          // Keep the original value if it isn't valid JSON.
        }
      }

      return {
        ...row,
        risk_score: Number(row.risk_score),
        amount: Number(row.amount),
        alert_reason: parsedReason,
      };
    });

    return NextResponse.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Fraud alerts retrieval failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve fraud alerts from MySQL.",
      },
      { status: 500 }
    );
  }
}

// PATCH: Update an alert and record the authenticated user's action.
export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const actorId = parsePositiveId(auth.session!.user.id);

  if (actorId === null) {
    return NextResponse.json(
      { success: false, message: "Invalid authenticated user." },
      { status: 401 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("alertId" in body) ||
    !("status" in body)
  ) {
    return NextResponse.json(
      { success: false, message: "alertId and status are required." },
      { status: 400 }
    );
  }

  const alertId = parsePositiveId(body.alertId);
  const requestedStatus = body.status;

  if (alertId === null || !isAlertStatus(requestedStatus)) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Provide a valid alertId and status: NEW, UNDER_REVIEW, CONFIRMED_FRAUD, FALSE_POSITIVE, or CLOSED.",
      },
      { status: 400 }
    );
  }

  const status = requestedStatus;
  let connection: PoolConnection | undefined;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.query<ExistingAlertRow[]>(
      `SELECT alert_id, alert_status
       FROM fraud_alerts
       WHERE alert_id = ?
       FOR UPDATE`,
      [alertId]
    );

    if (existingRows.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { success: false, message: "Fraud alert not found." },
        { status: 404 }
      );
    }

    const previousStatus = existingRows[0].alert_status;

    if (previousStatus === status) {
      await connection.rollback();

      return NextResponse.json({
        success: true,
        message: "Fraud alert already has the requested status.",
        alertId,
        previousStatus,
        status,
        unchanged: true,
      });
    }

    // Do not reopen a finalized alert while its linked investigation
    // case is still marked as resolved.
    if (
      FINAL_STATUSES.includes(previousStatus as AlertStatus) &&
      !FINAL_STATUSES.includes(status)
    ) {
      const [cases] = await connection.query<LinkedCaseRow[]>(
        `SELECT case_id, case_status
         FROM investigation_cases
         WHERE alert_id = ?
         ORDER BY case_id DESC
         LIMIT 1
         FOR UPDATE`,
        [alertId]
      );

      if (cases.some((item) => item.case_status === "RESOLVED")) {
        await connection.rollback();

        return NextResponse.json(
          {
            success: false,
            message:
              "This alert is linked to a resolved investigation case. Reopen or reconcile the case before reopening the alert.",
          },
          { status: 409 }
        );
      }
    }

    const resolvedAt = FINAL_STATUSES.includes(status)
      ? new Date()
      : null;

    await connection.execute<ResultSetHeader>(
      `UPDATE fraud_alerts
       SET alert_status = ?, resolved_at = ?
       WHERE alert_id = ?`,
      [status, resolvedAt, alertId]
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO audit_logs
         (user_id, action_type, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        actorId,
        "FRAUD_ALERT_STATUS_UPDATED",
        "fraud_alerts",
        String(alertId),
        JSON.stringify({
          previousStatus,
          newStatus: status,
          changedByRole: auth.session!.user.role,
        }),
      ]
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Fraud alert status updated successfully.",
      alertId,
      previousStatus,
      status,
      resolvedAt,
    });
  } catch (error) {
    if (connection) await rollbackQuietly(connection);

    console.error("Fraud alert update failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update the fraud alert. Check the server logs.",
      },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}
