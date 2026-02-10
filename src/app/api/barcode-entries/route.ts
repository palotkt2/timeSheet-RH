import { NextResponse, NextRequest } from 'next/server';
import { getDB, initDB } from '@/lib/db';

/**
 * GET /api/barcode-entries
 * Returns barcode entries (time clock punches) from the local instance.
 * This endpoint is called by adapters when this instance is configured as a remote plant.
 * 
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 500)
 *   - startDate: Filter by start date (YYYY-MM-DD)
 *   - endDate: Filter by end date (YYYY-MM-DD)
 *   - action: Filter by action type (Entrada/Salida)
 */
export async function GET(request: NextRequest) {
  try {
    initDB();
    const db = getDB();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '500', 10);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const action = searchParams.get('action');

    const offset = (page - 1) * limit;

    // Build query
    let query = `
      SELECT 
        id,
        barcode as employee_number,
        timestamp,
        action,
        created_at
      FROM barcode_entries
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (startDate) {
      query += ' AND date(timestamp) >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date(timestamp) <= ?';
      params.push(endDate);
    }
    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM barcode_entries WHERE 1=1';
    const countParams: (string | number)[] = [];
    if (startDate) {
      countQuery += ' AND date(timestamp) >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ' AND date(timestamp) <= ?';
      countParams.push(endDate);
    }
    if (action) {
      countQuery += ' AND action = ?';
      countParams.push(action);
    }

    const data = db.prepare(query).all(...params);
    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching barcode entries:', error);
    
    // If table doesn't exist, return empty array
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('no such table')) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 500,
          total: 0,
          totalPages: 0,
        },
        message: 'No barcode entries table found. This instance may not have a physical time clock.',
      });
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Error al obtener registros de checadas',
        message: errorMessage 
      },
      { status: 500 }
    );
  }
}
