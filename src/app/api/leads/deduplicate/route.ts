import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findDuplicateLeads, executeDeleteDuplicateLeads } from '@/lib/deduplicate';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').toLowerCase();
    const isSuperAdmin = currentUser && (
      currentUser.isSuperAdmin ||
      currentUser.role === 'SUPERADMIN' ||
      currentUser.username?.toLowerCase() === superUsername ||
      currentUser.username?.toLowerCase() === 'sudo'
    );

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Superadmin can scan duplicate leads in Danger Zone.' },
        { status: 403 }
      );
    }

    const { totalLeadsScanned, duplicateCount, uniqueCount, duplicateGroups } = await findDuplicateLeads();

    return NextResponse.json({
      success: true,
      totalLeadsScanned,
      duplicateCount,
      uniqueCount,
      groupsCount: duplicateGroups.length,
    });
  } catch (error: any) {
    console.error('Scan duplicate leads error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to scan duplicate leads' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const currentUser = await getCurrentUser();
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').toLowerCase();
    const isSuperAdmin = currentUser && (
      currentUser.isSuperAdmin ||
      currentUser.role === 'SUPERADMIN' ||
      currentUser.username?.toLowerCase() === superUsername ||
      currentUser.username?.toLowerCase() === 'sudo'
    );

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Superadmin can delete duplicate leads in Danger Zone.' },
        { status: 403 }
      );
    }

    const result = await executeDeleteDuplicateLeads();

    return NextResponse.json({
      success: true,
      ...result,
      message: `Successfully deleted ${result.duplicateCount} duplicate lead(s). Preserved ${result.uniqueCount} unique lead(s).`,
    });
  } catch (error: any) {
    console.error('Delete duplicate leads error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete duplicate leads' },
      { status: 500 }
    );
  }
}

