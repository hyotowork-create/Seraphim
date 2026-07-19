import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor, toErrorResponse, readJson } from "@/lib/http";
import { updateUser } from "@/lib/services/users";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  try {
    const { id } = await params;
    const updated = await updateUser(prisma, actor, id, await readJson(req));
    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
