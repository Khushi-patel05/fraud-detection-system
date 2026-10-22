
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function requireApiAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      response: NextResponse.json(
        {
          success: false,
          message: "Authentication required. Please sign in.",
        },
        { status: 401 }
      ),
    };
  }

  return {
    session,
    response: null,
  };
}

export function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        message: "Administrator access required.",
      },
      { status: 403 }
    );
  }

  return null;
}
