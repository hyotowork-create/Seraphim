import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor, toErrorResponse, readJson } from "@/lib/http";
import { createBudgetCode, listBudgetCodes } from "@/lib/services/budgetCodes";

export async function GET() {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await listBudgetCodes(prisma, actor));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  try {
    const created = await createBudgetCode(prisma, actor, await readJson(req));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
