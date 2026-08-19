import { prisma } from '@/lib/prisma';
import { parsePhoneNumber } from '@/lib/utils';

export interface DuplicateGroup {
  keeperId: number;
  duplicateIds: number[];
  key: string;
}

export interface DeduplicateScanResult {
  totalLeadsScanned: number;
  duplicateCount: number;
  uniqueCount: number;
  groupsCount: number;
}

export interface DeduplicateExecutionResult extends DeduplicateScanResult {
  deletedIds: number[];
}

function scoreLead(lead: {
  assignedConsultant?: string | null;
  status?: string | null;
  remark?: string | null;
  followUpDate1?: Date | null;
  followUpDate2?: Date | null;
  testDrive?: string | null;
  branch?: string | null;
  adname?: string | null;
  city?: string | null;
  platform?: string | null;
}): number {
  let score = 0;
  // Has consultant assigned (+100)
  if (lead.assignedConsultant && lead.assignedConsultant.trim()) score += 100;
  // Status progressed beyond not_contacted/created (+50)
  if (lead.status && !['not_contacted', 'created'].includes(lead.status)) score += 50;
  // Has remark (+30)
  if (lead.remark && lead.remark.trim()) score += 30;
  // Has follow up date (+20)
  if (lead.followUpDate1 || lead.followUpDate2) score += 20;
  // Has test drive (+10)
  if (lead.testDrive && lead.testDrive.trim()) score += 10;
  // Has branch (+5)
  if (lead.branch && lead.branch.trim()) score += 5;
  // Has adname (+5)
  if (lead.adname && lead.adname.trim()) score += 5;
  // Has city (+5)
  if (lead.city && lead.city.trim()) score += 5;
  // Has known platform/source (+5)
  if (lead.platform && lead.platform !== 'Unknown') score += 5;
  return score;
}

export async function findDuplicateLeads(): Promise<{
  totalLeadsScanned: number;
  duplicateCount: number;
  uniqueCount: number;
  duplicateGroups: DuplicateGroup[];
}> {
  const allLeads = await prisma.lead.findMany({
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  const groupsByPhone = new Map<string, typeof allLeads>();
  const groupsByOther = new Map<string, typeof allLeads>();

  for (const lead of allLeads) {
    const cleanPhone = parsePhoneNumber(lead.phone);
    if (cleanPhone && cleanPhone.length >= 10) {
      const existing = groupsByPhone.get(cleanPhone) || [];
      existing.push(lead);
      groupsByPhone.set(cleanPhone, existing);
    } else {
      const cleanName = (lead.name || '').trim().toLowerCase();
      const cleanCity = (lead.city || '').trim().toLowerCase();
      if (cleanName && cleanCity) {
        const key = `${cleanName}|${cleanCity}`;
        const existing = groupsByOther.get(key) || [];
        existing.push(lead);
        groupsByOther.set(key, existing);
      }
    }
  }

  const duplicateGroups: DuplicateGroup[] = [];
  let totalDuplicates = 0;

  function processGroup(leads: typeof allLeads, groupKey: string) {
    if (leads.length <= 1) return;

    // Sort leads: highest score first, then most recently updated
    leads.sort((a, b) => {
      const scoreDiff = scoreLead(b) - scoreLead(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const keeper = leads[0];
    const duplicates = leads.slice(1);
    const duplicateIds = duplicates.map(d => d.id);

    duplicateGroups.push({
      keeperId: keeper.id,
      duplicateIds,
      key: groupKey,
    });
    totalDuplicates += duplicateIds.length;
  }

  for (const [phone, leads] of groupsByPhone.entries()) {
    processGroup(leads, `Phone: ${phone}`);
  }

  for (const [key, leads] of groupsByOther.entries()) {
    processGroup(leads, `Customer: ${key}`);
  }

  return {
    totalLeadsScanned: allLeads.length,
    duplicateCount: totalDuplicates,
    uniqueCount: allLeads.length - totalDuplicates,
    duplicateGroups,
  };
}

export async function executeDeleteDuplicateLeads(): Promise<DeduplicateExecutionResult> {
  const { totalLeadsScanned, duplicateCount, uniqueCount, duplicateGroups } = await findDuplicateLeads();

  if (duplicateGroups.length === 0) {
    return {
      totalLeadsScanned,
      duplicateCount: 0,
      uniqueCount: totalLeadsScanned,
      groupsCount: 0,
      deletedIds: [],
    };
  }

  const allDuplicateIds: number[] = [];

  // Merge any missing non-empty information from duplicates into keeper before deleting
  for (const group of duplicateGroups) {
    const keeper = await prisma.lead.findUnique({ where: { id: group.keeperId } });
    if (!keeper) continue;

    const duplicates = await prisma.lead.findMany({
      where: { id: { in: group.duplicateIds } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {};
    for (const dup of duplicates) {
      allDuplicateIds.push(dup.id);
      if (!keeper.city && dup.city) patch.city = dup.city;
      if (!keeper.branch && dup.branch) patch.branch = dup.branch;
      if (!keeper.adname && dup.adname) patch.adname = dup.adname;
      if ((!keeper.platform || keeper.platform === 'Unknown') && dup.platform && dup.platform !== 'Unknown') patch.platform = dup.platform;
      if (!keeper.remark && dup.remark) patch.remark = dup.remark;
      if (!keeper.followUpDate1 && dup.followUpDate1) patch.followUpDate1 = dup.followUpDate1;
      if (!keeper.followUpDate2 && dup.followUpDate2) patch.followUpDate2 = dup.followUpDate2;
      if (!keeper.assignedConsultant && dup.assignedConsultant) patch.assignedConsultant = dup.assignedConsultant;
      if (!keeper.testDrive && dup.testDrive) patch.testDrive = dup.testDrive;
    }

    if (Object.keys(patch).length > 0) {
      await prisma.lead.update({
        where: { id: keeper.id },
        data: patch,
      }).catch(err => console.error(`Failed to merge data into keeper lead ${keeper.id}:`, err));
    }
  }

  // Delete duplicates in batches
  const chunkSize = 100;
  for (let i = 0; i < allDuplicateIds.length; i += chunkSize) {
    const chunk = allDuplicateIds.slice(i, i + chunkSize);
    await prisma.lead.deleteMany({
      where: { id: { in: chunk } },
    });
  }

  return {
    totalLeadsScanned,
    duplicateCount: allDuplicateIds.length,
    uniqueCount: totalLeadsScanned - allDuplicateIds.length,
    groupsCount: duplicateGroups.length,
    deletedIds: allDuplicateIds,
  };
}
