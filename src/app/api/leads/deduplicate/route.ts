import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findDuplicateLeads, executeDeleteDuplicateLeads } from '@/lib/deduplicate';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Administrators can scan duplicate leads.' },
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
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Administrators can delete duplicate leads.' },
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
