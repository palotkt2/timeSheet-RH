import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type {
  WeeklyReportResponse,
  DailyData,
  DayStatusCode,
  ScheduleConfig,
} from '@/types';

interface ExportOptions {
  data: WeeklyReportResponse;
  calculateDayStatus: (
    dayData: DailyData | undefined,
    date: string,
    schedule: ScheduleConfig['schedule'],
    holidays: Array<{ date: string }>,
  ) => DayStatusCode;
}

const STATUS_FILLS: Record<string, ExcelJS.FillPattern> = {
  A: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } },
  R: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAB308' } },
  F: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } },
  H: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } },
  N: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } },
  E: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' },
};

const SUBHEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF3B82F6' },
};

const COLUMN_HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
};

const WHITE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
};

const SUMMARY_FILLS: Record<string, ExcelJS.FillPattern> = {
  green: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } },
  red: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } },
  yellow: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCA8A04' } },
  orange: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } },
  purple: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
  teal: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } },
};

function formatLateTime(minutes: number): string {
  if (minutes === 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function exportWeeklyReportToExcel({
  data,
  calculateDayStatus,
}: ExportOptions): Promise<boolean> {
  if (!data?.employees?.length) throw new Error('No hay datos para exportar');

  const { employees, workdays, startDate, endDate, scheduleConfig } = data;
  const allDays = workdays;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BenchPro Multi-Plant Timesheet';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Reporte Semanal', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
  });

  // --- Row 1: Title ---
  const totalCols = 4 + allDays.length + 6;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'BenchPro — Reporte Semanal de Asistencia Multi-Planta';
  titleCell.font = { ...WHITE_FONT, size: 14 };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // --- Row 2: Date range ---
  ws.mergeCells(2, 1, 2, totalCols);
  const dateCell = ws.getCell(2, 1);
  dateCell.value = `Período: ${startDate} al ${endDate} — Generado: ${new Date().toLocaleString('es-MX')}`;
  dateCell.font = { color: { argb: 'FFFFFFFF' }, size: 10 };
  dateCell.fill = SUBHEADER_FILL;
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // --- Row 3: Legend ---
  ws.mergeCells(3, 1, 3, totalCols);
  const legendCell = ws.getCell(3, 1);
  legendCell.value =
    'A = Asistencia  |  R = Retardo  |  F = Falta  |  H = Festivo  |  N = No laboral  |  E = Extra';
  legendCell.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  legendCell.alignment = { horizontal: 'center' };
  ws.getRow(3).height = 18;

  // --- Row 4: Empty spacer ---
  ws.getRow(4).height = 6;

  // --- Row 5: Column headers ---
  const headers: string[] = ['No.', 'ID', 'Nombre', 'Puesto'];
  allDays.forEach((day) => headers.push(day.dayName));
  headers.push(
    'Asist.',
    'Faltas',
    'Retardos',
    'T. Retardos',
    'H. Extra',
    'Plantas',
  );

  const headerRow = ws.getRow(5);
  headerRow.height = 24;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { ...WHITE_FONT, size: 9 };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = THIN_BORDER;

    // Color summary column headers
    const colIdx = i - (4 + allDays.length);
    if (colIdx === 0) cell.fill = SUMMARY_FILLS.green;
    else if (colIdx === 1) cell.fill = SUMMARY_FILLS.red;
    else if (colIdx === 2) cell.fill = SUMMARY_FILLS.yellow;
    else if (colIdx === 3) cell.fill = SUMMARY_FILLS.orange;
    else if (colIdx === 4) cell.fill = SUMMARY_FILLS.purple;
    else if (colIdx === 5) cell.fill = SUMMARY_FILLS.teal;
    else cell.fill = COLUMN_HEADER_FILL;
  });

  // --- Data rows ---
  const getDayStatus = (
    emp: { dailyData: Record<string, DailyData> },
    date: string,
  ): DayStatusCode => {
    const dayData = emp.dailyData[date];
    if (dayData?.isNonWorkday) return dayData.status === 'Festivo' ? 'H' : 'N';
    return calculateDayStatus(
      dayData,
      date,
      scheduleConfig?.schedule || null,
      scheduleConfig?.holidays || [],
    );
  };

  employees.forEach((emp, idx) => {
    const rowNum = 6 + idx;
    const row = ws.getRow(rowNum);
    const employeeWorkdaysCount = emp.employeeWorkdaysCount || workdays.length;
    const faltas = employeeWorkdaysCount - emp.daysPresent;
    const retardos = emp.daysLate || emp.daysIncomplete || 0;
    const totalLateMinutes = emp.totalLateMinutes || 0;

    const allPlantsUsed = new Set<string>();
    Object.values(emp.dailyData).forEach((d) => {
      if (d.plantsUsed)
        d.plantsUsed.forEach((p: string) => allPlantsUsed.add(p));
    });

    // Fixed columns
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = emp.employeeNumber;
    row.getCell(3).value = emp.employeeName;
    row.getCell(3).alignment = { horizontal: 'left' };
    row.getCell(4).value = emp.employeeRole || '-';

    // Day status columns
    allDays.forEach((day, dayIdx) => {
      const cell = row.getCell(5 + dayIdx);
      const dayData = emp.dailyData[day.date];

      if (!dayData) {
        cell.value = 'N/L';
        cell.fill = STATUS_FILLS.N;
      } else if (dayData.isWorkday === false) {
        if (dayData.status !== 'Ausente' && dayData.hours > 0) {
          cell.value = 'E';
          cell.fill = STATUS_FILLS.E;
        } else {
          cell.value = '-';
          cell.fill = STATUS_FILLS.N;
        }
      } else {
        const status = getDayStatus(emp, day.date);
        cell.value = status;
        if (STATUS_FILLS[status]) cell.fill = STATUS_FILLS[status];
      }

      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    });

    // Summary columns
    const summaryStart = 5 + allDays.length;
    const summaryBgs: Record<string, ExcelJS.FillPattern> = {
      greenLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' },
      },
      redLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' },
      },
      yellowLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' },
      },
      orangeLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEDD5' },
      },
      purpleLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3E8FF' },
      },
      tealLight: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCFBF1' },
      },
    };

    const summaryData: Array<{
      value: string | number;
      fill: ExcelJS.FillPattern;
      align?: 'left' | 'center';
    }> = [
      { value: emp.daysPresent, fill: summaryBgs.greenLight },
      {
        value: faltas,
        fill: faltas > 0 ? summaryBgs.redLight : summaryBgs.greenLight,
      },
      {
        value: retardos,
        fill: retardos > 0 ? summaryBgs.yellowLight : summaryBgs.greenLight,
      },
      {
        value: formatLateTime(totalLateMinutes),
        fill:
          totalLateMinutes > 0 ? summaryBgs.orangeLight : summaryBgs.greenLight,
      },
      {
        value:
          (emp.totalOvertimeHours || 0) > 0
            ? `${emp.totalOvertimeHours}h`
            : '-',
        fill:
          (emp.totalOvertimeHours || 0) > 0
            ? summaryBgs.purpleLight
            : summaryBgs.greenLight,
      },
      {
        value: [...allPlantsUsed].join(', ') || '-',
        fill: summaryBgs.tealLight,
        align: 'left',
      },
    ];

    summaryData.forEach((s, i) => {
      const cell = row.getCell(summaryStart + i);
      cell.value = s.value;
      cell.fill = s.fill;
      cell.alignment = { horizontal: s.align || 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
      cell.font = { size: 9 };
    });

    // Style fixed columns
    for (let c = 1; c <= 4; c++) {
      const cell = row.getCell(c);
      cell.border = THIN_BORDER;
      cell.font = { size: 9 };
      if (c !== 3)
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Alternate row bg
    if (idx % 2 === 1) {
      const altFill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' },
      };
      for (let c = 1; c <= 4; c++) {
        const cell = row.getCell(c);
        if (
          !cell.fill ||
          (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined
        ) {
          cell.fill = altFill;
        }
      }
    }
  });

  // --- Column widths ---
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 16;
  for (let i = 0; i < allDays.length; i++) {
    ws.getColumn(5 + i).width = 6;
  }
  const summaryStart = 5 + allDays.length;
  ws.getColumn(summaryStart).width = 8;
  ws.getColumn(summaryStart + 1).width = 8;
  ws.getColumn(summaryStart + 2).width = 10;
  ws.getColumn(summaryStart + 3).width = 12;
  ws.getColumn(summaryStart + 4).width = 10;
  ws.getColumn(summaryStart + 5).width = 20;

  // --- Generate and download ---
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `Reporte_Semanal_${startDate}_${endDate}.xlsx`);
  return true;
}
