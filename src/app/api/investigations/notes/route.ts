
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

// GET: List notes for an investigation case.
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const caseId = Number(searchParams.get("caseId"));

    if (!Number.isSafeInteger(caseId) || caseId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "A valid caseId query parameter is required.",
        },
        { status: 400 }
      );
    }

    const [cases] = await pool.query<RowDataPacket[]>(
      `SELECT case_id
       FROM investigation_cases
       WHERE case_id = ?`,
      [caseId]
    );

    if (cases.length === 0) {
      return NextResponse.json(
        { success: false, error: "Investigation case not found." },
        { status: 404 }
      );
    }

    const [notes] = await pool.query<RowDataPacket[]>(
      `SELECT
         cn.note_id,
         cn.case_id,
         cn.author_id,
         cn.note_text,
         cn.created_at,
         u.full_name AS author_name
       FROM case_notes cn
       LEFT JOIN users u ON cn.author_id = u.user_id
       WHERE cn.case_id = ?
       ORDER BY cn.created_at DESC, cn.note_id DESC`,
      [caseId]
    );

    return NextResponse.json({
      success: true,
      count: notes.length,
      notes,
    });
  } catch (error) {
    console.error("GET investigation notes error:", error);

    return NextResponse.json(
      { success: false, error: "Failed to fetch investigation notes." },
      { status: 500 }
    );
  }
}

// POST: Add a note and record the action in the audit trail.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let connection: PoolConnection | undefined;

  try {
    let body: { caseId?: unknown; noteText?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    const caseId = Number(body.caseId);
    const noteText =
      typeof body.noteText === "string" ? body.noteText.trim() : "";

    // The author is always the authenticated user.
    const authorId = Number(auth.session!.user.id);

    if (!Number.isSafeInteger(authorId) || authorId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid authenticated user." },
        { status: 401 }
      );
    }

    if (!Number.isSafeInteger(caseId) || caseId <= 0) {
      return NextResponse.json(
        { success: false, error: "A valid caseId is required." },
        { status: 400 }
      );
    }

    if (!noteText) {
      return NextResponse.json(
        { success: false, error: "Note text cannot be empty." },
        { status: 400 }
      );
    }

    if (noteText.length > 10000) {
      return NextResponse.json(
        { success: false, error: "Note text is too long." },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [cases] = await connection.query<RowDataPacket[]>(
      `SELECT case_id
       FROM investigation_cases
       WHERE case_id = ?
       FOR UPDATE`,
      [caseId]
    );

    if (cases.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { success: false, error: "Investigation case not found." },
        { status: 404 }
      );
    }

    const [users] = await connection.query<RowDataPacket[]>(
      `SELECT user_id
       FROM users
       WHERE user_id = ? AND is_active = 1`,
      [authorId]
    );

    if (users.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { success: false, error: "Active note author not found." },
        { status: 401 }
      );
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO case_notes (case_id, author_id, note_text)
       VALUES (?, ?, ?)`,
      [caseId, authorId, noteText]
    );

    await connection.query<ResultSetHeader>(
      `INSERT INTO audit_logs
         (user_id, action_type, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        authorId,
        "NOTE_CREATED",
        "case_notes",
        String(result.insertId),
        JSON.stringify({
          note_id: result.insertId,
          case_id: caseId,
          author_id: authorId,
          message: "Investigation note created",
        }),
      ]
    );

    await connection.commit();

    return NextResponse.json(
      {
        success: true,
        message: "Investigation note added and audit log recorded.",
        noteId: result.insertId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Investigation note rollback failed:",
          rollbackError
        );
      }
    }

    console.error("POST investigation note error:", error);

    return NextResponse.json(
      { success: false, error: "Failed to add investigation note." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}
