
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

const CASE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
] as const;

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const ALERT_OUTCOMES = [
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "CLOSED",
] as const;

type CaseStatus = (typeof CASE_STATUSES)[number];
type Priority = (typeof PRIORITIES)[number];
type AlertOutcome = (typeof ALERT_OUTCOMES)[number];

type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string | number;
  details: Record<string, unknown>;
  userId: number;
};

type CaseUpdate = {
  old: unknown;
  new: unknown;
};

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T {
  return (
    typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
  );
}

function parsePositiveId(value: unknown): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function parseJsonObject(
  request: Request
): Promise<
  | { body: Record<string, unknown>; response: null }
  | { body: null; response: NextResponse }
> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return {
      body: null,
      response: NextResponse.json(
        {
          success: false,
          error: "Request body must contain valid JSON.",
        },
        { status: 400 }
      ),
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return {
      body: null,
      response: NextResponse.json(
        {
          success: false,
          error: "Request body must be a JSON object.",
        },
        { status: 400 }
      ),
    };
  }

  return {
    body: parsed as Record<string, unknown>,
    response: null,
  };
}

function getAuthenticatedUserId(session: {
  user?: { id?: string | number | null } | null;
}): number | null {
  return parsePositiveId(session.user?.id);
}

async function writeAuditLog(
  connection: PoolConnection,
  entry: AuditEntry
) {
  await connection.query<ResultSetHeader>(
    `INSERT INTO audit_logs
      (user_id, action_type, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      entry.userId,
      entry.action,
      entry.entityType,
      String(entry.entityId),
      JSON.stringify(entry.details),
    ]
  );
}

async function rollbackQuietly(connection: PoolConnection) {
  try {
    await connection.rollback();
  } catch (error) {
    console.error("Investigation transaction rollback failed:", error);
  }
}

function serverError(message: string, error: unknown) {
  console.error(message, error);

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}

// GET: List investigation cases.
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        ic.case_id,
        ic.alert_id,
        ic.assigned_to,
        ic.case_status,
        ic.priority,
        ic.conclusion,
        ic.opened_at,
        ic.closed_at,
        fa.transaction_id,
        fa.risk_score,
        fa.risk_level,
        fa.alert_status,
        fa.alert_reason,
        t.transaction_reference,
        t.transaction_type,
        t.amount,
        t.merchant,
        t.transaction_location,
        t.transaction_status,
        t.transaction_time,
        c.customer_id,
        c.full_name AS customer_name,
        u.full_name AS assigned_analyst
      FROM investigation_cases ic
      INNER JOIN fraud_alerts fa
        ON ic.alert_id = fa.alert_id
      INNER JOIN transactions t
        ON fa.transaction_id = t.transaction_id
      INNER JOIN accounts a
        ON t.account_id = a.account_id
      INNER JOIN customers c
        ON a.customer_id = c.customer_id
      LEFT JOIN users u
        ON ic.assigned_to = u.user_id
      ORDER BY ic.opened_at DESC
    `);

    return NextResponse.json({
      success: true,
      count: rows.length,
      cases: rows,
    });
  } catch (error) {
    return serverError("Failed to fetch investigation cases.", error);
  }
}

// POST: Create a case from an existing fraud alert.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const actorId = getAuthenticatedUserId(auth.session!);

  if (actorId === null) {
    return NextResponse.json(
      { success: false, error: "Invalid authenticated user." },
      { status: 401 }
    );
  }

  let connection: PoolConnection | undefined;

  try {
    const parsed = await parseJsonObject(request);
    if (parsed.response) return parsed.response;

    const body = parsed.body;
    const alertId = parsePositiveId(body.alertId);

    if (alertId === null) {
      return NextResponse.json(
        { success: false, error: "A valid alertId is required." },
        { status: 400 }
      );
    }

    const priorityValue = body.priority ?? "MEDIUM";

    if (!isOneOf(priorityValue, PRIORITIES)) {
      return NextResponse.json(
        { success: false, error: "Invalid case priority." },
        { status: 400 }
      );
    }

    const priority: Priority = priorityValue;

    const assignedTo =
      body.assignedTo === undefined ||
      body.assignedTo === null ||
      body.assignedTo === ""
        ? null
        : parsePositiveId(body.assignedTo);

    if (
      body.assignedTo !== undefined &&
      body.assignedTo !== null &&
      body.assignedTo !== "" &&
      assignedTo === null
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid analyst ID." },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [alerts] = await connection.query<RowDataPacket[]>(
      `SELECT alert_id, alert_status
       FROM fraud_alerts
       WHERE alert_id = ?
       FOR UPDATE`,
      [alertId]
    );

    if (alerts.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { success: false, error: "Fraud alert not found." },
        { status: 404 }
      );
    }

    if (
      ["CONFIRMED_FRAUD", "FALSE_POSITIVE", "CLOSED"].includes(
        alerts[0].alert_status
      )
    ) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          error: "This fraud alert has already been resolved or closed.",
        },
        { status: 409 }
      );
    }

    if (assignedTo !== null) {
      const [users] = await connection.query<RowDataPacket[]>(
        `SELECT user_id
         FROM users
         WHERE user_id = ?
           AND is_active = 1
           AND role = 'FRAUD_ANALYST'`,
        [assignedTo]
      );

      if (users.length === 0) {
        await connection.rollback();

        return NextResponse.json(
          {
            success: false,
            error: "Active fraud analyst not found.",
          },
          { status: 400 }
        );
      }
    }

    const [existingCases] = await connection.query<RowDataPacket[]>(
      `SELECT case_id
       FROM investigation_cases
       WHERE alert_id = ?
         AND case_status <> 'RESOLVED'
       LIMIT 1`,
      [alertId]
    );

    if (existingCases.length > 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          error: "An unresolved case already exists for this alert.",
          caseId: existingCases[0].case_id,
        },
        { status: 409 }
      );
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO investigation_cases
        (alert_id, assigned_to, case_status, priority)
       VALUES (?, ?, 'OPEN', ?)`,
      [alertId, assignedTo, priority]
    );

    await writeAuditLog(connection, {
      action: "CASE_CREATED",
      entityType: "investigation_cases",
      entityId: result.insertId,
      userId: actorId,
      details: {
        case_id: result.insertId,
        alert_id: alertId,
        case_status: "OPEN",
        priority,
        assigned_to: assignedTo,
      },
    });

    await connection.commit();

    return NextResponse.json(
      {
        success: true,
        message: "Investigation case created successfully.",
        caseId: result.insertId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection) await rollbackQuietly(connection);

    return serverError("Failed to create investigation case.", error);
  } finally {
    connection?.release();
  }
}

// PATCH: Update a case and record changes in the audit trail.
export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const actorId = getAuthenticatedUserId(auth.session!);

  if (actorId === null) {
    return NextResponse.json(
      { success: false, error: "Invalid authenticated user." },
      { status: 401 }
    );
  }

  let connection: PoolConnection | undefined;

  try {
    const parsed = await parseJsonObject(request);
    if (parsed.response) return parsed.response;

    const body = parsed.body;
    const caseId = parsePositiveId(body.caseId);

    if (caseId === null) {
      return NextResponse.json(
        { success: false, error: "A valid caseId is required." },
        { status: 400 }
      );
    }

    const allowedFields = [
      "status",
      "priority",
      "assignedTo",
      "conclusion",
      "alertOutcome",
    ];

    if (!allowedFields.some((field) => body[field] !== undefined)) {
      return NextResponse.json(
        { success: false, error: "No fields supplied to update." },
        { status: 400 }
      );
    }

    let status: CaseStatus | undefined;

    if (body.status !== undefined) {
      if (!isOneOf(body.status, CASE_STATUSES)) {
        return NextResponse.json(
          { success: false, error: "Invalid investigation status." },
          { status: 400 }
        );
      }

      status = body.status;
    }

    let priority: Priority | undefined;

    if (body.priority !== undefined) {
      if (!isOneOf(body.priority, PRIORITIES)) {
        return NextResponse.json(
          { success: false, error: "Invalid case priority." },
          { status: 400 }
        );
      }

      priority = body.priority;
    }

    let alertOutcome: AlertOutcome | undefined;

    if (body.alertOutcome !== undefined) {
      if (!isOneOf(body.alertOutcome, ALERT_OUTCOMES)) {
        return NextResponse.json(
          { success: false, error: "Invalid fraud alert outcome." },
          { status: 400 }
        );
      }

      alertOutcome = body.alertOutcome;
    }

    let assignedTo: number | null | undefined;

    if (body.assignedTo !== undefined) {
      assignedTo =
        body.assignedTo === null || body.assignedTo === ""
          ? null
          : parsePositiveId(body.assignedTo);

      if (
        body.assignedTo !== null &&
        body.assignedTo !== "" &&
        assignedTo === null
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid analyst ID." },
          { status: 400 }
        );
      }
    }

    let conclusion: string | null | undefined;

    if (body.conclusion !== undefined) {
      if (
        body.conclusion !== null &&
        typeof body.conclusion !== "string"
      ) {
        return NextResponse.json(
          { success: false, error: "Conclusion must be text." },
          { status: 400 }
        );
      }

      conclusion =
        typeof body.conclusion === "string"
          ? body.conclusion.trim() || null
          : null;

      if (conclusion && conclusion.length > 500) {
        return NextResponse.json(
          {
            success: false,
            error: "Conclusion cannot exceed 500 characters.",
          },
          { status: 400 }
        );
      }
    }

    const resolving = status === "RESOLVED";

    if (resolving && !alertOutcome) {
      return NextResponse.json(
        {
          success: false,
          error: "Choose a valid alert outcome before resolving the case.",
        },
        { status: 400 }
      );
    }

    if (!resolving && alertOutcome !== undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Choose a final alert outcome only when resolving the case.",
        },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [caseRows] = await connection.query<RowDataPacket[]>(
      `SELECT
         ic.case_id,
         ic.alert_id,
         ic.assigned_to,
         ic.case_status,
         ic.priority,
         ic.conclusion,
         fa.alert_status
       FROM investigation_cases ic
       INNER JOIN fraud_alerts fa
         ON ic.alert_id = fa.alert_id
       WHERE ic.case_id = ?
       FOR UPDATE`,
      [caseId]
    );

    if (caseRows.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { success: false, error: "Investigation case not found." },
        { status: 404 }
      );
    }

    const current = caseRows[0];

    if (
      ["CONFIRMED_FRAUD", "FALSE_POSITIVE", "CLOSED"].includes(
        current.alert_status
      ) &&
      current.case_status !== "RESOLVED"
    ) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          error:
            "The linked fraud alert is already closed. Reconcile its status before updating this case.",
        },
        { status: 409 }
      );
    }

    if (assignedTo !== undefined && assignedTo !== null) {
      const [users] = await connection.query<RowDataPacket[]>(
        `SELECT user_id
         FROM users
         WHERE user_id = ?
           AND is_active = 1
           AND role = 'FRAUD_ANALYST'`,
        [assignedTo]
      );

      if (users.length === 0) {
        await connection.rollback();

        return NextResponse.json(
          {
            success: false,
            error: "Active fraud analyst not found.",
          },
          { status: 400 }
        );
      }
    }

    const finalConclusion =
      conclusion !== undefined ? conclusion : current.conclusion;

    if (resolving && !finalConclusion) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          error: "Enter a conclusion before resolving the case.",
        },
        { status: 400 }
      );
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const changes: Record<string, CaseUpdate> = {};

    if (
      status !== undefined &&
      status !== current.case_status
    ) {
      fields.push("case_status = ?");
      values.push(status);

      fields.push(
        status === "RESOLVED"
          ? "closed_at = NOW()"
          : "closed_at = NULL"
      );

      changes.case_status = {
        old: current.case_status,
        new: status,
      };
    }

    if (
      priority !== undefined &&
      priority !== current.priority
    ) {
      fields.push("priority = ?");
      values.push(priority);

      changes.priority = {
        old: current.priority,
        new: priority,
      };
    }

    if (
      assignedTo !== undefined &&
      assignedTo !== current.assigned_to
    ) {
      fields.push("assigned_to = ?");
      values.push(assignedTo);

      changes.assigned_to = {
        old: current.assigned_to,
        new: assignedTo,
      };
    }

    if (
      conclusion !== undefined &&
      conclusion !== current.conclusion
    ) {
      fields.push("conclusion = ?");
      values.push(conclusion);

      changes.conclusion = {
        old: current.conclusion,
        new: conclusion,
      };
    }

    if (fields.length > 0) {
      values.push(caseId);

      await connection.query<ResultSetHeader>(
        `UPDATE investigation_cases
         SET ${fields.join(", ")}
         WHERE case_id = ?`,
        values
      );
    }

    for (const [field, value] of Object.entries(changes)) {
      let action = "CASE_UPDATED";

      if (field === "case_status") {
        action =
          value.new === "RESOLVED"
            ? "CASE_RESOLVED"
            : "CASE_STATUS_CHANGED";
      } else if (field === "priority") {
        action = "CASE_PRIORITY_CHANGED";
      } else if (field === "assigned_to") {
        action = "CASE_ASSIGNED";
      } else if (field === "conclusion") {
        action = "CASE_CONCLUSION_UPDATED";
      }

      await writeAuditLog(connection, {
        action,
        entityType: "investigation_cases",
        entityId: caseId,
        userId: actorId,
        details: {
          case_id: caseId,
          alert_id: current.alert_id,
          field,
          old_value: value.old,
          new_value: value.new,
        },
      });
    }

    if (resolving) {
      await connection.query<ResultSetHeader>(
        `UPDATE fraud_alerts
         SET alert_status = ?, resolved_at = NOW()
         WHERE alert_id = ?`,
        [alertOutcome, current.alert_id]
      );

      if (current.alert_status !== alertOutcome) {
        await writeAuditLog(connection, {
          action: "ALERT_STATUS_CHANGED",
          entityType: "fraud_alerts",
          entityId: current.alert_id,
          userId: actorId,
          details: {
            alert_id: current.alert_id,
            case_id: caseId,
            old_status: current.alert_status,
            new_status: alertOutcome,
            reason: "Investigation case resolved",
          },
        });
      }
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: resolving
        ? "Case resolved, alert updated, and audit records saved."
        : "Case updated and audit records saved.",
      caseId,
    });
  } catch (error) {
    if (connection) await rollbackQuietly(connection);

    return serverError("Failed to update investigation case.", error);
  } finally {
    connection?.release();
  }
}
