export interface FollowUpItem {
  id?: number | string;
  leadId?: number;
  step: number;
  date: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface FollowUpInputState {
  step: number;
  label: string;
  dateStr: string; // DD-MM-YYYY formatted display
  isoDate: string; // YYYY-MM-DD for <input type="date" />
  rawDate: Date | string | null;
  exists: boolean;
}

export interface FollowUpInputsStateResult {
  count: number;
  input1: FollowUpInputState;
  input2: FollowUpInputState;
}

/**
 * Format date to DD-MM-YYYY in Asia/Kolkata timezone
 */
export function formatToDDMMYYYY(date?: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(d).replace(/\//g, '-');
}

/**
 * Format date to YYYY-MM-DD for standard HTML <input type="date"> in Asia/Kolkata timezone
 */
export function toISTInputDateString(date?: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Fetch all follow-ups for a lead ordered by step
 */
export async function getLeadFollowUps(leadId: number | string): Promise<FollowUpItem[]> {
  const id = typeof leadId === 'string' ? parseInt(leadId, 10) : leadId;
  if (isNaN(id)) return [];

  if (typeof window !== 'undefined') return [];

  const { prisma } = await import('./prisma');
  const followUps = await prisma.leadFollowUp.findMany({
    where: { leadId: id },
    orderBy: { step: 'asc' },
  });

  return followUps;
}

/**
 * Return total follow-up count for a lead
 */
export async function getLeadFollowUpCount(leadId: number | string): Promise<number> {
  const id = typeof leadId === 'string' ? parseInt(leadId, 10) : leadId;
  if (isNaN(id)) return 0;

  if (typeof window !== 'undefined') return 0;

  const { prisma } = await import('./prisma');
  return prisma.leadFollowUp.count({
    where: { leadId: id },
  });
}

/**
 * Compute dynamic input 1 and input 2 steps/labels/values:
 * - 0 follow-ups: input1 = step 1 (empty), input2 = step 2 (empty)
 * - 1 follow-up: input1 = step 1 (date), input2 = step 2 (empty)
 * - N follow-ups: input1 = step N (date), input2 = step N+1 (empty)
 */
export function getFollowUpInputsState(
  followUps?: FollowUpItem[] | null,
  fallbackDates?: { followUpDate1?: Date | string | null; followUpDate2?: Date | string | null }
): FollowUpInputsStateResult {
  // If followUps array is provided and not empty
  const items: FollowUpItem[] = Array.isArray(followUps) ? [...followUps] : [];

  // Fallback to legacy followUpDate1 and followUpDate2 if followUps array is empty
  if (items.length === 0 && fallbackDates) {
    if (fallbackDates.followUpDate1) {
      items.push({ step: 1, date: fallbackDates.followUpDate1 });
    }
    if (fallbackDates.followUpDate2) {
      items.push({ step: 2, date: fallbackDates.followUpDate2 });
    }
  }

  // Sort by step ascending
  items.sort((a, b) => a.step - b.step);

  const count = items.length;

  if (count === 0) {
    return {
      count: 0,
      input1: {
        step: 1,
        label: 'F1',
        dateStr: '',
        isoDate: '',
        rawDate: null,
        exists: false,
      },
      input2: {
        step: 2,
        label: 'F2',
        dateStr: '',
        isoDate: '',
        rawDate: null,
        exists: false,
      },
    };
  }

  if (count === 1) {
    const item1 = items[0];
    return {
      count: 1,
      input1: {
        step: item1.step || 1,
        label: `F${item1.step || 1}`,
        dateStr: formatToDDMMYYYY(item1.date),
        isoDate: toISTInputDateString(item1.date),
        rawDate: item1.date,
        exists: true,
      },
      input2: {
        step: (item1.step || 1) + 1,
        label: `F${(item1.step || 1) + 1}`,
        dateStr: '',
        isoDate: '',
        rawDate: null,
        exists: false,
      },
    };
  }

  // N follow-ups (N >= 2)
  const lastItem = items[count - 1];
  const lastStep = lastItem.step || count;
  const nextStep = lastStep + 1;

  return {
    count,
    input1: {
      step: lastStep,
      label: `F${lastStep}`,
      dateStr: formatToDDMMYYYY(lastItem.date),
      isoDate: toISTInputDateString(lastItem.date),
      rawDate: lastItem.date,
      exists: true,
    },
    input2: {
      step: nextStep,
      label: `F${nextStep}`,
      dateStr: '',
      isoDate: '',
      rawDate: null,
      exists: false,
    },
  };
}

/**
 * Format all follow-ups for Excel export: joins with \r\n and step numbers
 */
export function formatAllFollowUpsForExcel(
  followUps?: FollowUpItem[] | null,
  fallbackDates?: { followUpDate1?: Date | string | null; followUpDate2?: Date | string | null }
): string {
  const items: FollowUpItem[] = Array.isArray(followUps) ? [...followUps] : [];

  if (items.length === 0 && fallbackDates) {
    if (fallbackDates.followUpDate1) {
      items.push({ step: 1, date: fallbackDates.followUpDate1 });
    }
    if (fallbackDates.followUpDate2) {
      items.push({ step: 2, date: fallbackDates.followUpDate2 });
    }
  }

  if (items.length === 0) return '-';

  items.sort((a, b) => a.step - b.step);

  return items
    .map((f) => `F${f.step}: ${formatToDDMMYYYY(f.date)}`)
    .join('\r\n');
}
