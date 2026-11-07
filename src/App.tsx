import {MyDuties} from './components/MyDuties';
import { AccountLeaves } from './components/AccountLeaves';
import { vnDay } from './services/schoolTime';
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ScheduleTableView } from './components/ScheduleTableView';
import { AutoScheduleView } from './components/AutoScheduleView';
import { EmployeeManagementView } from './components/EmployeeManagementView';
import { StatisticsReportView } from './components/StatisticsReportView';
import { CompensatoryDutyView } from './components/CompensatoryDutyView';
import { ExportPrintView } from './components/ExportPrintView';
import { TestVerificationView } from './components/TestVerificationView';
import { ShiftAdjustmentModal } from './components/ShiftAdjustmentModal';
import { GmailNotificationModal } from './components/GmailNotificationModal';
import { SettingsModal } from './components/SettingsModal';
import { SwapView } from './components/SwapView';
import { AuditList } from './components/AccountAudit';
import { SystemView } from './components/SystemView';
import { BackupsView } from './components/BackupsView';
import { AccountsView } from './components/AccountsView';
import { api, call, type Profile } from './services/api';
import { storageEvents } from './services/storage';
import { SyncNewEmployeeModal } from './components/SyncNewEmployeeModal';
import {
  Employee,
  UnavailableDate,
  ShiftAssignment,
  ShiftChangeHistory,
  ShiftChangeRequest,
  ScheduleSettings,
  AppUserRole,
  LeaveStatus,
  CompensatoryDuty,
  AuthUser,
} from './types';
import { StorageService } from './services/storage';
import { ExportService } from './services/exportService';
import {
  autoSwapShiftOnLeaveApproval,
  autoAssignNewEmployeeToShifts,
  autoFillAllEmptyShifts,
} from './services/scheduler';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export default function App({ profile, authUser, onLogout }: { profile: Profile; authUser: AuthUser; onLogout: () => void }) {
  const currentUserRole = authUser.role;
  // Database states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<UnavailableDate[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [history, setHistory] = useState<ShiftChangeHistory[]>([]);
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [compensatoryDuties, setCompensatoryDuties] = useState<CompensatoryDuty[]>([]);
  const [settings, setSettings] = useState<ScheduleSettings>(StorageService.getSettings());

  // Auth & UI state
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [lookupEmployeeId,setLookupEmployeeId]=useState<string|null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);


  // Modal states
  const [adjustingShift, setAdjustingShift] = useState<ShiftAssignment | null>(null);
  const [adjustingRole, setAdjustingRole] = useState<'teacher1' | 'teacher2' | 'admin' | 'guard'>('teacher1');
  const [adjustingTargetEmployeeId, setAdjustingTargetEmployeeId] = useState<string | undefined>(undefined);
  const [adjustingTargetShiftDate, setAdjustingTargetShiftDate] = useState<string | undefined>(undefined);
  const [gmailNoticeShift, setGmailNoticeShift] = useState<ShiftAssignment | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [syncTargetEmployeeId, setSyncTargetEmployeeId] = useState<string | null>(null);
  const [swapToast, setSwapToast] = useState<{
    type: 'success' | 'warning' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Nạp bản dữ liệu chung được WebSocket cập nhật.
  const loadData = useCallback(() => {
    StorageService.initDatabase();
    setEmployees(StorageService.getEmployees());
    setUnavailableDates(StorageService.getUnavailableDates());
    setShifts(StorageService.getShifts());
    setHistory(StorageService.getHistory());
    setRequests(StorageService.getRequests());
    setCompensatoryDuties(StorageService.getCompensatoryDuties());
    setSettings(StorageService.getSettings());
  }, []);

  useEffect(() => {
    loadData();
    storageEvents.addEventListener('data', loadData);
    const failed = () => setSwapToast(null);
    storageEvents.addEventListener('failure', failed);
    return () => { storageEvents.removeEventListener('data', loadData); storageEvents.removeEventListener('failure', failed); };
  }, [loadData]);

  // Dark mode effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handlers for Employees & Schedule Auto-Sync
  const handleAddEmployee = (emp: Employee) => {
    const updatedEmployees = [...employees, emp];
    setEmployees(updatedEmployees);
    StorageService.saveEmployees(updatedEmployees);

    setSwapToast({type:'info',title:'Đang lưu và phân bổ ca',message:'Hệ thống tự điền vị trí trống đúng chức danh và cân bằng ca tương lai. Kết quả sẽ cập nhật sau khi lưu thành công.'});
  };

  const handleUpdateEmployee = (emp: Employee) => {
    const updated = employees.map((e) => (e.id === emp.id ? emp : e));
    setEmployees(updated);
    StorageService.saveEmployees(updated);
  };

  const handleDeleteEmployee = (empId: string) => {
    const updated = employees.filter((e) => e.id !== empId);
    setEmployees(updated);
    StorageService.saveEmployees(updated);

    // Cập nhật các ca có nhân sự này thành trống
    const updatedShifts = shifts.map((s) => {
      let changed = false;
      const sCopy = { ...s };
      if (sCopy.teacher1Id === empId) {
        sCopy.teacher1Id = null;
        changed = true;
      }
      if (sCopy.teacher2Id === empId) {
        sCopy.teacher2Id = null;
        changed = true;
      }
      if (sCopy.adminId === empId) {
        sCopy.adminId = null;
        changed = true;
      }
      if (sCopy.guardId === empId) {
        sCopy.guardId = null;
        changed = true;
      }
      if (changed) {
        sCopy.status = 'INCOMPLETE';
      }
      return sCopy;
    });

    setShifts(updatedShifts);
    StorageService.saveShifts(updatedShifts);
  };

  const handleImportEmployees = (
    imported: Employee[],
    mode: 'merge_update' | 'add_only' | 'replace_all' = 'merge_update'
  ) => {
    let updated: Employee[] = [];
    if (mode === 'replace_all') {
      updated = [...imported];
    } else if (mode === 'add_only') {
      const existingCodes = new Set(employees.map((e) => e.code.toUpperCase()));
      const toAdd = imported.filter((e) => !existingCodes.has(e.code.toUpperCase()));
      updated = [...employees, ...toAdd];
    } else {
      // merge_update: nếu đã có mã thì cập nhật, nếu chưa thì thêm mới
      const empMap = new Map<string, Employee>();
      employees.forEach((e) => empMap.set(e.code.toUpperCase(), { ...e }));
      imported.forEach((emp) => {
        const key = emp.code.toUpperCase();
        if (empMap.has(key)) {
          const prev = empMap.get(key)!;
          empMap.set(key, {
            ...prev,
            name: emp.name || prev.name,
            role: emp.role || prev.role,
            department: emp.department || prev.department,
            phone: emp.phone || prev.phone,
            email: emp.email || prev.email,
            notes: emp.notes !== undefined ? emp.notes : prev.notes,
          });
        } else {
          empMap.set(key, emp);
        }
      });
      updated = Array.from(empMap.values());
    }

    setEmployees(updated);
    StorageService.saveEmployees(updated);

    setSwapToast({type:'info',title:'Đang lưu danh sách và phân bổ ca',message:'Nhân sự mới được tự động phân ca đúng chức danh; các ca tương lai được cân bằng trong nhóm.'});
  };

  const handleAutoFillEmptyShifts = () => {
    const fillRes = autoFillAllEmptyShifts(employees, shifts, unavailableDates, settings);
    if (fillRes.filledCount > 0) {
      setShifts(fillRes.updatedShifts);
      StorageService.saveShifts(fillRes.updatedShifts);
      setSwapToast({
        type: 'success',
        title: 'Đồng Bộ Lịch Trực Thành Công',
        message: `Đã tự động tìm và lấp đầy ${fillRes.filledCount} vị trí ca trực còn trống trong tháng cho cán bộ khả dụng!`,
      });
    } else {
      setSwapToast({
        type: 'info',
        title: 'Lịch Trực Đầy Đủ',
        message: 'Tất cả các ca trực từ hôm nay đã có đủ nhân sự, không có vị trí trống cần điền.',
      });
    }
  };

  const handleOpenSyncModal = (employeeId?: string) => {
    setSyncTargetEmployeeId(employeeId || null);
    setIsSyncModalOpen(true);
  };

  const handleApplySync = (
    updatedShifts: ShiftAssignment[],
    historyRecords: ShiftChangeHistory[],
    summaryMessage: string
  ) => {
    setShifts(updatedShifts);
    StorageService.saveShifts(updatedShifts);

    if (historyRecords.length > 0) {
      const updatedHistory = [...historyRecords, ...history];
      setHistory(updatedHistory);
      StorageService.saveHistory(updatedHistory);
    }

    setSwapToast({
      type: 'success',
      title: 'Đồng Bộ Lịch Trực Thành Công',
      message: summaryMessage,
    });
  };

  const handleImportSchedule = (importedShifts: ShiftAssignment[]) => {
    const shiftMap = new Map<string, ShiftAssignment>();
    shifts.forEach((s) => shiftMap.set(s.date, s));
    importedShifts.forEach((s) => shiftMap.set(s.date, s));
    const updated = Array.from(shiftMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    setShifts(updated);
    StorageService.saveShifts(updated);
  };

  // Handlers for Leave / Unavailable Dates
  const handleAddLeave = (leave: UnavailableDate) => {
    const updatedLeaves = [leave, ...unavailableDates];
    setUnavailableDates(updatedLeaves);
    StorageService.saveUnavailableDates(updatedLeaves);

    if (leave.status === 'APPROVED') {
      const swapRes = autoSwapShiftOnLeaveApproval(
        leave,
        shifts,
        employees,
        updatedLeaves,
        settings
      );

      setShifts(swapRes.updatedShifts);
      StorageService.saveShifts(swapRes.updatedShifts);

      if (swapRes.newHistoryRecord) {
        const newHist: ShiftChangeHistory = {
          ...swapRes.newHistoryRecord,
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
        };
        const updatedHistory = [newHist, ...history];
        setHistory(updatedHistory);
        StorageService.saveHistory(updatedHistory);
      }

      if (swapRes.newCompensatoryDuty) {
        const updatedComp = [swapRes.newCompensatoryDuty, ...compensatoryDuties];
        setCompensatoryDuties(updatedComp);
        StorageService.saveCompensatoryDuties(updatedComp);
      }

      setSwapToast({
        type: swapRes.details.swapped ? 'success' : 'info',
        title: swapRes.details.swapped
          ? 'Tự Động Thay Ca & Ghi Nhận Trực Bù'
          : 'Duyệt Lịch Bận Thành Công',
        message: swapRes.details.message,
      });
    } else {
      setSwapToast({
        type: 'info',
        title: 'Đã Tiếp Nhận Đơn Đăng Ký Nghỉ Phép',
        message: `Đơn đăng ký ngày bận (${leave.date}) đã được gửi và lưu ở trạng thái "Chờ duyệt". Lịch trực sẽ không thay đổi cho đến khi Ban Giám Hiệu phê duyệt.`,
      });
    }
  };

  const handleUpdateLeaveStatus = (leaveId: string, status: LeaveStatus) => {
    // Ràng buộc bảo mật: User/Giáo viên không tự ý phê duyệt nghỉ phép
    if (currentUserRole === 'TEACHER') {
      setSwapToast({
        type: 'warning',
        title: 'Không Có Quyền Phê Duyệt',
        message: 'Tài khoản Giáo viên (User) không được tự duyệt đơn nghỉ phép. Vui lòng chuyển sang vai trò Admin hoặc BGH để thực hiện.',
      });
      return;
    }

    const targetLeave = unavailableDates.find((l) => l.id === leaveId);
    const updatedLeaves = unavailableDates.map((l) => (l.id === leaveId ? { ...l, status } : l));
    setUnavailableDates(updatedLeaves);
    StorageService.saveUnavailableDates(updatedLeaves);

    if (status === 'APPROVED' && targetLeave) {
      const approvedLeave: UnavailableDate = { ...targetLeave, status: 'APPROVED' };
      const swapRes = autoSwapShiftOnLeaveApproval(
        approvedLeave,
        shifts,
        employees,
        updatedLeaves,
        settings
      );

      setShifts(swapRes.updatedShifts);
      StorageService.saveShifts(swapRes.updatedShifts);

      if (swapRes.newHistoryRecord) {
        const newHist: ShiftChangeHistory = {
          ...swapRes.newHistoryRecord,
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
        };
        const updatedHistory = [newHist, ...history];
        setHistory(updatedHistory);
        StorageService.saveHistory(updatedHistory);
      }

      if (swapRes.newCompensatoryDuty) {
        const updatedComp = [swapRes.newCompensatoryDuty, ...compensatoryDuties];
        setCompensatoryDuties(updatedComp);
        StorageService.saveCompensatoryDuties(updatedComp);
      }

      setSwapToast({
        type: swapRes.details.swapped ? 'success' : 'info',
        title: swapRes.details.swapped
          ? 'Tự Động Thay Ca & Ghi Nhận Trực Bù'
          : 'Đã Duyệt Đơn Nghỉ Phép',
        message: swapRes.details.message,
      });
    } else if (status === 'REJECTED') {
      setSwapToast({
        type: 'info',
        title: 'Đã Từ Chối Đơn Nghỉ Phép',
        message: 'Lịch trực hiện tại không bị thay đổi.',
      });
    }
  };

  const handleDeleteLeave = (leaveId: string) => {
    const updated = unavailableDates.filter((l) => l.id !== leaveId);
    setUnavailableDates(updated);
    StorageService.saveUnavailableDates(updated);
  };

  // Handlers for Compensatory Duties
  const handleUpdateCompensatoryDuties = (duties: CompensatoryDuty[]) => {
    setCompensatoryDuties(duties);
    StorageService.saveCompensatoryDuties(duties);
  };

  // Handlers for Shifts
  const handleSaveSchedule = (newShifts: ShiftAssignment[]) => {
    setShifts(newShifts);
    StorageService.saveShifts(newShifts);
  };

  const handleToggleLock = (shiftId: string) => {
    const updated = shifts.map((s) => (s.id === shiftId ? { ...s, isLocked: !s.isLocked } : s));
    setShifts(updated);
    StorageService.saveShifts(updated);
  };

  const handleRequestSwap = async (params: {
    shiftDate: string;
    targetEmployeeId: string;
    targetShiftDate?: string | null;
    reason: string;
  }) => {
    await call('requestSwap', {
      shiftDate: params.shiftDate,
      targetEmployeeId: params.targetEmployeeId,
      targetShiftDate: params.targetShiftDate || null,
      reason: params.reason,
    });
    setSwapToast({
      type: 'success',
      title: 'Đã gửi đề nghị đổi ca',
      message: 'Đề nghị đổi ca đã được gửi thành công. Lịch trực sẽ chính thức thay đổi khi đồng nghiệp đồng ý hoặc Ban Giám Hiệu phê duyệt.',
    });
    await StorageService.refresh().catch(() => {});
  };

  const handleApplyShiftAdjustment = (
    updatedShift: ShiftAssignment,
    historyRecord: Omit<ShiftChangeHistory, 'id' | 'timestamp'>,
    compensatoryDuty?: CompensatoryDuty
  ) => {
    const newShifts = shifts.map((s) => (s.id === updatedShift.id ? updatedShift : s));
    setShifts(newShifts);
    StorageService.saveShifts(newShifts);

    const newHist: ShiftChangeHistory = {
      ...historyRecord,
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    const newHistory = [newHist, ...history];
    setHistory(newHistory);
    StorageService.saveHistory(newHistory);

    if (compensatoryDuty) {
      const updatedComp = [compensatoryDuty, ...compensatoryDuties];
      setCompensatoryDuties(updatedComp);
      StorageService.saveCompensatoryDuties(updatedComp);
    }
  };

  // Handlers for Settings
  const handleSaveSettings = (newSettings: ScheduleSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
  };

  const handleResetDefaults = () => {
    StorageService.resetToDefaults();
    loadData();
  };

  // Metrics for badges
  const pendingLeavesCount = unavailableDates.filter((u) => u.status === 'PENDING').length;
  const pendingCompensatoryCount = compensatoryDuties.filter((c) => c.status === 'PENDING').length;
  const pendingSwapsCount = requests.filter((r) => r.status === 'PENDING' && (r.targetEmployeeId === profile.employeeId || currentUserRole === 'ADMIN')).length;
  const conflictsCount = shifts.filter(
    (s) => s.status === 'INCOMPLETE' || s.status === 'CONFLICT'
  ).length;

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUserRole={currentUserRole}
        pendingLeavesCount={pendingLeavesCount}
        pendingCompensatoryCount={pendingCompensatoryCount}
        pendingSwapsCount={pendingSwapsCount}
        conflictsCount={conflictsCount}
        schoolName={settings.schoolName}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Viewport */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          currentUserRole={currentUserRole}

          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          pendingLeavesCount={pendingLeavesCount}
          authUser={authUser}

          onLogout={onLogout}
        />

        {/* Scrollable Content Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Auto Swap Notification Toast */}
            {swapToast && (
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-xs transition-all ${
                  swapToast.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100'
                    : swapToast.type === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  {swapToast.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : swapToast.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider">{swapToast.title}</h4>
                    <p className="text-xs mt-0.5 leading-relaxed">{swapToast.message}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSwapToast(null)}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {currentTab === 'swaps' && <SwapView profile={profile} employees={employees} shifts={shifts} />}
            {currentTab === 'activity' && currentUserRole === 'ADMIN' && <AuditList />}
            {currentTab === 'system' && currentUserRole === 'ADMIN' && <SystemView />}
            {currentTab === 'backups' && currentUserRole === 'ADMIN' && <BackupsView />}
            {currentTab === 'accounts' && currentUserRole === 'ADMIN' && <AccountsView employees={employees} />}
            {(currentTab === 'dashboard' || (currentTab === 'overview' && currentUserRole === 'ADMIN')) && (
              <DashboardView
                canManage={currentUserRole === 'ADMIN'}
                employees={employees}
                shifts={shifts}
                unavailableDates={unavailableDates}
                changeRequests={requests}
                onNavigateTab={setCurrentTab}
                onOpenGmailNotice={(shift) => setGmailNoticeShift(shift)}
                onQuickSwap={(shift) => {
                  if (currentUserRole !== 'ADMIN') { setCurrentTab('swaps'); return; }
                  setAdjustingShift(shift);
                  setAdjustingRole('teacher1');
                }}
              />
            )}

            {currentTab === 'my-duties' && <MyDuties personal employees={employees} shifts={shifts} employeeId={profile.employeeId}/>}
            {currentTab === 'lookup' && <MyDuties key={lookupEmployeeId||'search'} employees={employees} shifts={shifts} initialEmployeeId={lookupEmployeeId}/>}

            {currentTab === 'schedule' && (
              <ScheduleTableView
                profile={profile}
                onViewEmployee={id=>{setLookupEmployeeId(id);setCurrentTab('lookup');}}
                shifts={shifts}
                employees={employees}
                currentUserRole={currentUserRole}
                onToggleLock={handleToggleLock}
                onOpenSwapModal={(shift, role, targetEmpId, targetDate) => {
                  setAdjustingShift(shift);
                  setAdjustingRole(role || 'teacher1');
                  setAdjustingTargetEmployeeId(targetEmpId);
                  setAdjustingTargetShiftDate(targetDate);
                }}
                onOpenGmailNotice={(shift) => setGmailNoticeShift(shift)}
                onExportExcel={(selectedMonth) => {
                  const mToExport = selectedMonth || vnDay().slice(0,7);
                  const [y, m] = mToExport.split('-');
                  ExportService.exportScheduleToExcel(shifts, employees, settings, `${m}/${y}`);
                }}
                onNavigateAutoSchedule={() => setCurrentTab('auto-schedule')}
                onImportSchedule={handleImportSchedule}
                onAutoFillShifts={handleAutoFillEmptyShifts}
                onOpenSyncModal={handleOpenSyncModal}
              />
            )}

            {currentTab === 'auto-schedule' && currentUserRole === 'ADMIN' && (
              <AutoScheduleView
                employees={employees}
                unavailableDates={unavailableDates}
                currentShifts={shifts}
                settings={settings}
                onSaveSchedule={handleSaveSchedule}
                onNavigateSchedule={() => setCurrentTab('schedule')}
              />
            )}

            {currentTab === 'employees' && currentUserRole === 'ADMIN' && (
              <EmployeeManagementView
                employees={employees}
                shifts={shifts}
                currentUserRole={currentUserRole}
                onAddEmployee={handleAddEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onImportEmployees={handleImportEmployees}
                onAutoFillShifts={handleAutoFillEmptyShifts}
                onOpenSyncModal={handleOpenSyncModal}
              />
            )}

            {currentTab === 'leaves' && <div className="space-y-6">
              <AccountLeaves admin={currentUserRole==='ADMIN'} employeeId={profile.employeeId} employees={employees} shifts={shifts} onAddLeave={handleAddLeave} onReview={handleUpdateLeaveStatus} onDelete={handleDeleteLeave}/>
              <SwapView profile={profile} employees={employees} shifts={shifts}/>
            </div>}

            {currentTab === 'compensatory' && currentUserRole === 'ADMIN' && (
              <CompensatoryDutyView
                compensatoryDuties={compensatoryDuties}
                employees={employees}
                shifts={shifts}
                unavailableDates={unavailableDates}
                settings={settings}
                currentUserRole={currentUserRole}
                onUpdateDuties={handleUpdateCompensatoryDuties}
                onUpdateShifts={handleSaveSchedule}
                onShowNotification={(title, message, type) =>
                  setSwapToast({ title, message, type })
                }
              />
            )}

            {currentTab === 'statistics' && (
              <StatisticsReportView
                employees={employees}
                shifts={shifts}
                unavailableDates={unavailableDates}
                history={history}
                settings={settings}
                compensatoryDuties={compensatoryDuties}
                onNavigatePrint={() => setCurrentTab('export')}
              />
            )}

            {currentTab === 'export' && (
              <ExportPrintView shifts={shifts} employees={employees} settings={settings} />
            )}

            {currentTab === 'tests' && currentUserRole === 'ADMIN' && (
              <TestVerificationView
                employees={employees}
                unavailableDates={unavailableDates}
                settings={settings}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Modals */}
      {adjustingShift && (
        <ShiftAdjustmentModal
          isOpen={!!adjustingShift}
          onClose={() => {
            setAdjustingShift(null);
            setAdjustingTargetEmployeeId(undefined);
            setAdjustingTargetShiftDate(undefined);
          }}
          shift={adjustingShift}
          initialRole={adjustingRole}
          initialTargetEmployeeId={adjustingTargetEmployeeId}
          initialTargetShiftDate={adjustingTargetShiftDate}
          employees={employees}
          allShifts={shifts}
          unavailableDates={unavailableDates}
          settings={settings}
          currentUserRole={currentUserRole}
          profile={profile}
          onApplyAdjustment={handleApplyShiftAdjustment}
          onRequestSwap={handleRequestSwap}
        />
      )}

      {gmailNoticeShift && (
        <GmailNotificationModal
          isOpen={!!gmailNoticeShift}
          onClose={() => setGmailNoticeShift(null)}
          shift={gmailNoticeShift}
          employees={employees}
          settings={settings}
        />
      )}

      {isSettingsOpen && currentUserRole === 'ADMIN' && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onResetDefaults={handleResetDefaults}
          onDataReload={loadData}
        />
      )}

      {/* Sync New Employee Duty Schedule Modal */}
      {isSyncModalOpen && currentUserRole === 'ADMIN' && (
        <SyncNewEmployeeModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          employees={employees}
          shifts={shifts}
          unavailableDates={unavailableDates}
          settings={settings}
          preselectedEmployeeId={syncTargetEmployeeId}
          onApplySync={handleApplySync}
        />
      )}
    </div>
  );
}

