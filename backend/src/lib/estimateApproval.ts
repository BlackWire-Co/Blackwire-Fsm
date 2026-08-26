import { prisma } from "./prisma";
import { EstimateStatus, JobStatus } from "@prisma/client";
import { logAudit } from "./audit";

export async function approveEstimateById(params: {
  estimateId: string;
  approvedByName: string;
  ip?: string;
  actingUserId?: string; // staff user id, if a staff member recorded this
}) {
  const estimate = await prisma.estimate.update({
    where: { id: params.estimateId },
    data: {
      status: EstimateStatus.APPROVED,
      approvedAt: new Date(),
      approvedByName: params.approvedByName,
      approvalIp: params.ip,
    },
  });

  if (estimate.jobId) {
    await prisma.job.update({ where: { id: estimate.jobId }, data: { status: JobStatus.SCHEDULED } }).catch(() => {});
  }

  await logAudit({
    userId: params.actingUserId,
    action: "estimate.approved",
    entityType: "estimate",
    entityId: estimate.id,
    metadata: { approvedByName: params.approvedByName, viaPortal: !params.actingUserId },
  });

  return estimate;
}
