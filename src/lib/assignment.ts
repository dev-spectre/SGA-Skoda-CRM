import { prisma } from './prisma';
import { geocodeAddress, calculateDistance } from './utils';
import { updateSheetCell } from './google';

export async function assignNearestBranchToLead(leadId: number): Promise<string | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.assignedBranch) return lead?.assignedBranch || null;
  if (!lead.city && !lead.zipCode) return null;

  const branches = await prisma.branch.findMany({ where: { status: 'active' } });
  if (branches.length === 0) return null;

  const validBranches = branches.filter((b: { latitude?: number | null; longitude?: number | null }) => b.latitude && b.longitude);
  if (validBranches.length === 0) return null;

  const coords = await geocodeAddress(lead.city, lead.zipCode);
  if (!coords) return null;

  let nearestBranch = null;
  let minDistance = Infinity;

  for (const branch of validBranches) {
    const dist = calculateDistance(coords.lat, coords.lng, branch.latitude!, branch.longitude!);
    if (dist < minDistance) {
      minDistance = dist;
      nearestBranch = branch;
    }
  }

  if (nearestBranch) {
    // Update DB
    await prisma.lead.update({
      where: { id: lead.id },
      data: { assignedBranch: nearestBranch.name }
    });

    // Update Google Sheet if mapped
    if (lead.sheetId && lead.sheetRow) {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      if (settings?.googleAccessToken && settings.selectedSheetName && settings.columnMapping) {
        const mapping = JSON.parse(settings.columnMapping);
        if (mapping.branch !== undefined) {
          try {
            await updateSheetCell(
              settings.selectedSpreadsheetId!,
              settings.selectedSheetName,
              lead.sheetRow,
              mapping.branch,
              nearestBranch.name
            );
          } catch (err) {
            console.error(`Failed to update branch in Google Sheet for lead ${lead.id}:`, err);
          }
        }
      }
    }

    return nearestBranch.name;
  }

  return null;
}
