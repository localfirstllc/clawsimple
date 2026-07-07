import { NextResponse } from "next/server";
import { getDeployCapacity } from "@/lib/deploy/capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hetznerLimit = Number(process.env.HETZNER_LIMIT ?? "0");

  const capacity = await getDeployCapacity({
    hetznerLimit,
  });

  const canDeploy = capacity.hetznerAvailable > 0;

  return NextResponse.json({
    hetzner_limit: capacity.hetznerLimit,
    hetzner_used: capacity.hetznerUsed,
    hetzner_available: capacity.hetznerAvailable,
    can_deploy: canDeploy,
  });
}
