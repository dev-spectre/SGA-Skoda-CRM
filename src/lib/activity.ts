import { prisma } from '@/lib/prisma';
import { UserSession } from '@/lib/auth';

/**
 * Checks whether a given user session is a Superadmin.
 * Superadmin activities must remain completely hidden and are NEVER tracked.
 */
export function isSuperAdminUser(user?: UserSession | null): boolean {
  if (!user) return false;
  const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
  const currentUsername = (user.username || '').trim().toLowerCase();

  return Boolean(
    user.isSuperAdmin ||
    user.role === 'SUPERADMIN' ||
    user.userId === -1 ||
    currentUsername === superUsername ||
    currentUsername === 'sudo'
  );
}

export interface ActivityLogInput {
  leadId: number;
  user: UserSession | null;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface LeadDiffPayload {
  status?: string | null;
  remark?: string | null;
  followUpDate1?: string | Date | null;
  followUpDate2?: string | Date | null;
  assignedConsultant?: string | null;
  testDrive?: string | null;
  [key: string]: unknown;
}

/**
 * Logs a single activity/audit trail entry for a lead.
 * Silently skips if the performing user is Superadmin.
 */
export async function logLeadActivity({
  leadId,
  user,
  action,
  oldValue,
  newValue,
}: ActivityLogInput): Promise<void> {
  // CRITICAL REQUIREMENT: Superadmin activities are strictly hidden and not tracked!
  if (!user || isSuperAdminUser(user)) {
    return;
  }

  try {
    let dbUserId: number | null = null;
    if (user.userId && user.userId > 0) {
      const existingUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true },
      });
      if (existingUser) {
        dbUserId = existingUser.id;
      }
    }
    if (!dbUserId && user.username) {
      const dbUser = await prisma.user.findFirst({
        where: { username: { equals: user.username, mode: 'insensitive' } },
        select: { id: true },
      });
      if (dbUser) dbUserId = dbUser.id;
    }

    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: dbUserId,
        username: user.username,
        action,
        oldValue: oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
        newValue: newValue !== undefined && newValue !== null ? String(newValue) : null,
      },
    });
  } catch (error) {
    console.error('Failed to log lead activity:', error);
  }
}

/**
 * Formats date values cleanly for audit diffs
 */
function formatDateVal(val: unknown): string | null {
  if (!val) return null;
  try {
    const d = new Date(val as string | number | Date);
    if (isNaN(d.getTime())) return String(val);
    return d.toISOString().split('T')[0];
  } catch {
    return String(val);
  }
}

/**
 * Compares an existing lead object against the new update payload,
 * detecting all modified fields and logging corresponding activity entries.
 */
export async function logLeadDiff({
  leadId,
  user,
  previousLead,
  updates,
}: {
  leadId: number;
  user: UserSession | null;
  previousLead: LeadDiffPayload;
  updates: LeadDiffPayload;
}): Promise<void> {
  if (!user || isSuperAdminUser(user)) {
    return;
  }

  const activities: ActivityLogInput[] = [];

  // Status Change
  if (updates.status !== undefined) {
    const oldStatus = String(previousLead.status || 'not_contacted');
    const newStatus = String(updates.status || 'not_contacted');
    if (oldStatus !== newStatus) {
      activities.push({ leadId, user, action: 'STATUS_CHANGE', oldValue: oldStatus, newValue: newStatus });
    }
  }

  // Remark Update
  if (updates.remark !== undefined) {
    const oldRemark = String(previousLead.remark || '').trim();
    const newRemark = String(updates.remark || '').trim();
    if (oldRemark !== newRemark) {
      activities.push({ leadId, user, action: 'REMARK_UPDATE', oldValue: oldRemark || null, newValue: newRemark || null });
    }
  }

  // Follow Up Date 1
  if (updates.followUpDate1 !== undefined) {
    const oldDate = formatDateVal(previousLead.followUpDate1);
    const newDate = formatDateVal(updates.followUpDate1);
    if (oldDate !== newDate) {
      activities.push({ leadId, user, action: 'FOLLOWUP_DATE_1', oldValue: oldDate, newValue: newDate });
    }
  }

  // Follow Up Date 2
  if (updates.followUpDate2 !== undefined) {
    const oldDate = formatDateVal(previousLead.followUpDate2);
    const newDate = formatDateVal(updates.followUpDate2);
    if (oldDate !== newDate) {
      activities.push({ leadId, user, action: 'FOLLOWUP_DATE_2', oldValue: oldDate, newValue: newDate });
    }
  }

  // Assigned Consultant
  if (updates.assignedConsultant !== undefined) {
    const oldConsultant = String(previousLead.assignedConsultant || '').trim();
    const newConsultant = String(updates.assignedConsultant || '').trim();
    if (oldConsultant !== newConsultant) {
      activities.push({ leadId, user, action: 'CONSULTANT_ASSIGN', oldValue: oldConsultant || null, newValue: newConsultant || null });
    }
  }

  // Test Drive
  if (updates.testDrive !== undefined) {
    const oldTd = String(previousLead.testDrive || '').trim();
    const newTd = String(updates.testDrive || '').trim();
    if (oldTd !== newTd) {
      activities.push({ leadId, user, action: 'TEST_DRIVE', oldValue: oldTd || null, newValue: newTd || null });
    }
  }

  // Execute logging asynchronously
  for (const act of activities) {
    await logLeadActivity(act);
  }
}

export interface HandlerResolutionLead {
  id: number;
  status: string;
  assignedConsultant?: string | null;
  uploadedById?: number | null;
  uploadedBy?: { id?: number; username: string } | null;
  createdAt?: string | Date;
}

export interface ActivityRecordForHandler {
  leadId: number;
  userId: number | null;
  username: string;
  action: string;
  newValue?: string | null;
  createdAt: Date | string;
}

/**
 * Resolves the unique active handler for a lead according to the business rules:
 * 1. If lead status is 'not_contacted' or 'created', it is unhandled (handledBy = null).
 * 2. When a lead is moved out of 'not_contacted' (e.g. to pending/live/lost), the FIRST
 *    staff user to handle/modify it claims ownership.
 * 3. Subsequent edits by other users do NOT change handler ownership and will not count
 *    in their user activity (though their actions are recorded in the audit log).
 * 4. If the status is changed back to 'not_contacted', the user no longer handles the lead
 *    and any user is free to handle it again.
 */
export function resolveLeadHandler(
  lead: HandlerResolutionLead,
  leadActivities: ActivityRecordForHandler[], // chronologically sorted (asc)
  staffUsernames: Set<string>, // lowercase normalized staff usernames
  staffUserById?: Map<number, string>
): string | null {
  const currentStatus = (lead.status || 'not_contacted').toLowerCase();

  // Rule 1: If lead status is not_contacted / created -> No active handler
  if (currentStatus === 'not_contacted' || currentStatus === 'created') {
    return null;
  }

  // Rule 2 & 4: Find the latest reset to 'not_contacted' (if any)
  let lastResetTime: Date | null = null;
  for (let i = leadActivities.length - 1; i >= 0; i--) {
    const act = leadActivities[i];
    if (
      act.action === 'STATUS_CHANGE' &&
      act.newValue &&
      (act.newValue.toLowerCase() === 'not_contacted' || act.newValue.toLowerCase() === 'created')
    ) {
      lastResetTime = new Date(act.createdAt);
      break;
    }
  }

  // Rule 2 & 3: Find the FIRST staff user after the last reset
  for (const act of leadActivities) {
    if (lastResetTime && new Date(act.createdAt) <= lastResetTime) {
      continue;
    }

    const normUsername = act.username.trim().toLowerCase();
    if (staffUsernames.has(normUsername)) {
      return act.username.trim();
    }
    if (act.userId && staffUserById && staffUserById.has(act.userId)) {
      return staffUserById.get(act.userId)!;
    }
  }

  // Fallbacks if no activity logged in the current window:
  // Check assigned consultant
  if (lead.assignedConsultant) {
    const normConsultant = lead.assignedConsultant.trim().toLowerCase();
    if (staffUsernames.has(normConsultant)) {
      return lead.assignedConsultant.trim();
    }
  }

  // Check uploader
  if (lead.uploadedBy?.username) {
    const normUploader = lead.uploadedBy.username.trim().toLowerCase();
    if (staffUsernames.has(normUploader)) {
      return lead.uploadedBy.username.trim();
    }
  }
  if (lead.uploadedById && staffUserById && staffUserById.has(lead.uploadedById)) {
    return staffUserById.get(lead.uploadedById)!;
  }

  return null;
}

/**
 * Checks if a lead is locked from being modified by the current user.
 * 
 * Rules:
 * 1. Admin and Superadmin can modify any lead (override).
 * 2. If lead status is 'not_contacted' or 'created', ANY user can modify/claim it (isLocked = false).
 * 3. If lead status is handled (pending, live, lost) and is currently handled by a normal user (User A):
 *    - User A can modify it.
 *    - If currentUser is another normal user (User B), the lead IS LOCKED for User B (isLocked = true).
 * 4. If current handling user changes status back to 'not_contacted', the lock is released.
 */
export async function checkLeadLockForUser(
  leadId: number,
  currentUser: UserSession | null
): Promise<{ isLocked: boolean; handledBy: string | null; error?: string }> {
  if (!currentUser) {
    return { isLocked: true, handledBy: null, error: 'Unauthorized' };
  }

  // Admins and Superadmins have override access
  if (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin) {
    return { isLocked: false, handledBy: null };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      assignedConsultant: true,
      uploadedById: true,
      uploadedBy: { select: { id: true, username: true } },
    },
  });

  if (!lead) {
    return { isLocked: false, handledBy: null };
  }

  const currentStatus = (lead.status || 'not_contacted').toLowerCase();
  if (currentStatus === 'not_contacted' || currentStatus === 'created') {
    // Unhandled: free for any user to edit/claim
    return { isLocked: false, handledBy: null };
  }

  // Fetch activities for this lead to determine active handler
  const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
  const [staffUsers, leadActivities] = await Promise.all([
    prisma.user.findMany({
      where: {
        AND: [
          { username: { notIn: [superUsername, 'sudo'], mode: 'insensitive' } },
          { role: { not: 'SUPERADMIN' } },
        ],
      },
      select: { id: true, username: true },
    }),
    prisma.leadActivity.findMany({
      where: {
        leadId,
        username: { notIn: [superUsername, 'sudo'], mode: 'insensitive' },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        leadId: true,
        userId: true,
        username: true,
        action: true,
        newValue: true,
        createdAt: true,
      },
    }),
  ]);

  const staffUsernames = new Set<string>();
  const staffUserById = new Map<number, string>();
  for (const u of staffUsers) {
    staffUsernames.add(u.username.trim().toLowerCase());
    staffUserById.set(u.id, u.username);
  }

  const handledBy = resolveLeadHandler(lead, leadActivities, staffUsernames, staffUserById);
  if (!handledBy) {
    return { isLocked: false, handledBy: null };
  }

  const currentUsernameNorm = currentUser.username.trim().toLowerCase();
  const handledByNorm = handledBy.trim().toLowerCase();

  if (currentUsernameNorm !== handledByNorm) {
    return {
      isLocked: true,
      handledBy,
      error: `This lead is handled by "${handledBy}". You can't modify this lead.`,
    };
  }

  return { isLocked: false, handledBy };
}
