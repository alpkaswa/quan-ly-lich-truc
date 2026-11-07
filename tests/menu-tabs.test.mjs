import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
});

after(async () => {
  await vite?.close();
});

const mockEmployees = [
  { id: 'gv1', code: 'GV01', name: 'Nguyễn Văn A', role: 'TEACHER', department: 'Tổ Toán', phone: '0912345678', isActive: true },
  { id: 'gv2', code: 'GV02', name: 'Trần Thị B', role: 'TEACHER', department: 'Tổ Văn', phone: '0912345679', isActive: true },
  { id: 'ad1', code: 'AD01', name: 'Lê Văn C', role: 'ADMIN', department: 'Ban Giám Hiệu', phone: '0912345680', isActive: true },
  { id: 'bv1', code: 'BV01', name: 'Phạm Văn D', role: 'GUARD', department: 'Tổ Bảo vệ', phone: '0912345681', isActive: true },
];

const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const tomorrowDate = new Date();
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(tomorrowDate);

const mockShifts = [
  {
    id: `s-${todayStr}`,
    date: todayStr,
    dayOfWeek: 4,
    startTime: '07:00',
    endTime: '07:00 ngày hôm sau',
    teacher1Id: 'gv1',
    teacher2Id: 'gv2',
    adminId: 'ad1',
    guardId: 'bv1',
    status: 'COMPLETE',
    isLocked: false,
  },
  {
    id: `s-${tomorrowStr}`,
    date: tomorrowStr,
    dayOfWeek: 5,
    startTime: '07:00',
    endTime: '07:00 ngày hôm sau',
    teacher1Id: 'gv1',
    teacher2Id: 'gv2',
    adminId: 'ad1',
    guardId: 'bv1',
    status: 'COMPLETE',
    isLocked: false,
  },
];

const mockProfile = {
  id: 'u-gv1',
  employeeId: 'gv1',
  role: 'EMPLOYEE',
  displayName: 'Nguyễn Văn A',
  username: 'gv01',
  active: true,
};

const mockSettings = {
  schoolName: 'TRƯỜNG PHỔ THÔNG DÂN TỘC NỘI TRÚ NA RÌ',
  shiftDurationHours: 24,
  shiftStartTime: '07:00',
  shiftEndTime: '07:00 ngày hôm sau',
  requiredTeachers: 2,
  requiredAdmins: 1,
  requiredGuards: 1,
  disallowConsecutiveDays: true,
  respectApprovedUnavailabilities: true,
  fairDistribution: true,
};

// 1. Tab: dashboard (Hôm nay & Ngày mai)
test('Menu item: dashboard renders correctly', async () => {
  const { DashboardView } = await vite.ssrLoadModule('/src/components/DashboardView.tsx');
  const html = renderToStaticMarkup(
    createElement(DashboardView, {
      employees: mockEmployees,
      shifts: mockShifts,
      unavailableDates: [],
      changeRequests: [],
      onNavigateTab: () => {},
      onOpenGmailNotice: () => {},
      onQuickSwap: () => {},
      canManage: true,
    })
  );
  assert.ok(html.length > 0);
  assert.ok(html.includes('Nguyễn Văn A'));
});

// 2. Tab: my-duties (Ca trực của tôi)
test('Menu item: my-duties renders correctly', async () => {
  const { MyDuties } = await vite.ssrLoadModule('/src/components/MyDuties.tsx');
  const html = renderToStaticMarkup(
    createElement(MyDuties, {
      personal: true,
      employees: mockEmployees,
      shifts: mockShifts,
      employeeId: 'gv1',
    })
  );
  assert.ok(html.includes('Ca trực của tôi'));
});

// 3. Tab: schedule (Lịch tháng)
test('Menu item: schedule renders correctly', async () => {
  const { ScheduleTableView } = await vite.ssrLoadModule('/src/components/ScheduleTableView.tsx');
  const html = renderToStaticMarkup(
    createElement(ScheduleTableView, {
      profile: mockProfile,
      shifts: mockShifts,
      employees: mockEmployees,
      currentUserRole: 'EMPLOYEE',
      onToggleLock: () => {},
      onOpenSwapModal: () => {},
      onOpenGmailNotice: () => {},
      onExportExcel: () => {},
      onNavigateAutoSchedule: () => {},
    })
  );
  assert.ok(html.length > 0);
  assert.ok(html.includes(`${todayStr.slice(8, 10)}/${todayStr.slice(5, 7)}`) || html.includes('Lịch Trực') || html.includes('Lịch trực'));
});

// 4. Tab: lookup (Tìm ca trực)
test('Menu item: lookup renders correctly', async () => {
  const { MyDuties } = await vite.ssrLoadModule('/src/components/MyDuties.tsx');
  const html = renderToStaticMarkup(
    createElement(MyDuties, {
      employees: mockEmployees,
      shifts: mockShifts,
      initialEmployeeId: 'gv1',
    })
  );
  assert.ok(html.length > 0);
});

// 5. Tab: swaps (Đổi ca & Lịch sử)
test('Menu item: swaps renders correctly', async () => {
  const { SwapView } = await vite.ssrLoadModule('/src/components/SwapView.tsx');
  const html = renderToStaticMarkup(
    createElement(SwapView, {
      profile: mockProfile,
      employees: mockEmployees,
      shifts: mockShifts,
    })
  );
  assert.ok(html.includes('Đổi ca'));
  assert.ok(html.includes('Gửi đề nghị đổi ca'));
});

// 6. Tab: leaves (Lịch bận & Nghỉ phép)
test('Menu item: leaves renders correctly', async () => {
  const { UnavailableDatesView } = await vite.ssrLoadModule('/src/components/UnavailableDatesView.tsx');
  const html = renderToStaticMarkup(
    createElement(UnavailableDatesView, {
      currentUserRole: 'EMPLOYEE',
      currentEmployeeId: 'gv1',
      employees: mockEmployees,
      unavailableDates: [],
      onAddLeave: () => {},
      onUpdateStatus: () => {},
      onDeleteLeave: () => {},
    })
  );
  assert.ok(html.includes('Đăng Ký Ngày Bận / Nghỉ Phép'));
});

// 7. Tab: statistics (Thống kê)
test('Menu item: statistics renders correctly', async () => {
  const { StatisticsReportView } = await vite.ssrLoadModule('/src/components/StatisticsReportView.tsx');
  const html = renderToStaticMarkup(
    createElement(StatisticsReportView, {
      shifts: mockShifts,
      employees: mockEmployees,
      unavailableDates: [],
      history: [],
      settings: mockSettings,
      onNavigatePrint: () => {},
    })
  );
  assert.ok(html.includes('Biểu Đồ So Sánh') || html.includes('Độ Lệch Ca Trực') || html.includes('ca'));
});

// 8. Tab: export (In & Xuất lịch)
test('Menu item: export renders correctly', async () => {
  const { ExportPrintView } = await vite.ssrLoadModule('/src/components/ExportPrintView.tsx');
  const html = renderToStaticMarkup(
    createElement(ExportPrintView, {
      shifts: mockShifts,
      employees: mockEmployees,
      settings: mockSettings,
    })
  );
  assert.ok(html.length > 0);
  assert.ok(html.includes('Lịch Trực') || html.includes('In') || html.includes('Xuất'));
});

// 9. Tab: auto-schedule (Xếp lịch tự động - Admin)
test('Menu item: auto-schedule renders correctly', async () => {
  const { AutoScheduleView } = await vite.ssrLoadModule('/src/components/AutoScheduleView.tsx');
  const html = renderToStaticMarkup(
    createElement(AutoScheduleView, {
      employees: mockEmployees,
      unavailableDates: [],
      settings: mockSettings,
      onSaveSchedule: () => {},
      onSaveSettings: () => {},
    })
  );
  assert.ok(html.includes('Xếp Lịch') || html.includes('Tự Động'));
});

// 10. Tab: employees (Nhân sự - Admin)
test('Menu item: employees renders correctly', async () => {
  const { EmployeeManagementView } = await vite.ssrLoadModule('/src/components/EmployeeManagementView.tsx');
  const html = renderToStaticMarkup(
    createElement(EmployeeManagementView, {
      employees: mockEmployees,
      shifts: mockShifts,
      currentUserRole: 'ADMIN',
      onAddEmployee: () => {},
      onUpdateEmployee: () => {},
      onDeleteEmployee: () => {},
      onImportEmployees: () => {},
    })
  );
  assert.ok(html.includes('Nhân Sự') || html.includes('Cán Bộ') || html.includes('nhân sự'));
});

// 11. Tab: compensatory (Trực bù & Nợ ca - Admin)
test('Menu item: compensatory renders correctly', async () => {
  const { CompensatoryDutyView } = await vite.ssrLoadModule('/src/components/CompensatoryDutyView.tsx');
  const html = renderToStaticMarkup(
    createElement(CompensatoryDutyView, {
      compensatoryDuties: [],
      employees: mockEmployees,
      shifts: mockShifts,
      onAddDuty: () => {},
      onCompleteDuty: () => {},
      onDeleteDuty: () => {},
      onAutoAssignCompensation: () => {},
    })
  );
  assert.ok(html.includes('Trực bù') || html.includes('Nợ ca'));
});

// 12. Tab: accounts (Tài khoản nhân sự - Admin)
test('Menu item: accounts renders correctly', async () => {
  const { AccountsView } = await vite.ssrLoadModule('/src/components/AccountsView.tsx');
  const html = renderToStaticMarkup(
    createElement(AccountsView, {
      employees: mockEmployees,
    })
  );
  assert.ok(html.includes('Quản lý tài khoản') || html.includes('tài khoản'));
});

// 13. Tab: activity (Nhật ký hoạt động - Admin)
test('Menu item: activity renders correctly', async () => {
  const { AuditList } = await vite.ssrLoadModule('/src/components/AccountAudit.tsx');
  const html = renderToStaticMarkup(createElement(AuditList, {}));
  assert.ok(html.includes('Nhật ký hoạt động'));
});

// 14. Tab: system (Giám sát hệ thống - Admin)
test('Menu item: system renders correctly', async () => {
  const { SystemView } = await vite.ssrLoadModule('/src/components/SystemView.tsx');
  const html = renderToStaticMarkup(createElement(SystemView, {}));
  assert.ok(html.includes('Giám sát hệ thống'));
  assert.ok(html.includes('Chính sách lưu trữ') || html.includes('giải phóng dung lượng'));
});

// 15. Tab: backups (Sao lưu & Khôi phục - Admin)
test('Menu item: backups renders correctly', async () => {
  const { BackupsView } = await vite.ssrLoadModule('/src/components/BackupsView.tsx');
  const html = renderToStaticMarkup(createElement(BackupsView, {}));
  assert.ok(html.includes('Sao lưu'));
});

// 16. Tab: overview (Tổng quan quản lý - Admin)
test('Menu item: overview renders correctly', async () => {
  const { LiveOverview } = await vite.ssrLoadModule('/src/components/LiveOverview.tsx');
  const html = renderToStaticMarkup(
    createElement(LiveOverview, {
      employees: mockEmployees,
      shifts: mockShifts,
      requests: [],
    })
  );
  assert.ok(html.length > 0);
});

// 17. Tab: tests (Kiểm tra xếp lịch - Admin)
test('Menu item: tests renders correctly', async () => {
  const { TestVerificationView } = await vite.ssrLoadModule('/src/components/TestVerificationView.tsx');
  const html = renderToStaticMarkup(
    createElement(TestVerificationView, {
      employees: mockEmployees,
      shifts: mockShifts,
      unavailableDates: [],
      settings: mockSettings,
    })
  );
  assert.ok(html.length > 0);
});
