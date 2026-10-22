
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongo";
import { requireApiAuth, requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const adminError = requireAdmin(auth.session!.user.role);
  if (adminError) return adminError;

  try {
    const client = await clientPromise;
    const database = client.db("fraud_detection_db");

    await database.command({ ping: 1 });

    const requiredCollections = [
      "risk_analysis",
      "behavior_events",
      "investigation_evidence",
    ];

    const existingCollections = await database
      .listCollections()
      .toArray();

    const existingNames = new Set(
      existingCollections.map((collection) => collection.name)
    );

    for (const name of requiredCollections) {
      if (!existingNames.has(name)) {
        await database.createCollection(name);
      }
    }

    return NextResponse.json({
      success: true,
      message: "MongoDB connection successful and required collections are ready",
    });
  } catch (error) {
    console.error("MongoDB setup failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "MongoDB setup failed",
      },
      { status: 500 }
    );
  }
}
