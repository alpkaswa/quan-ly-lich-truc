import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  User,
  Shield,
  Clock,
  History,
  RotateCw,
  Info,
} from 'lucide-react';
import {
  ShiftAssignment,
  Employee,
  UnavailableDate,
  ScheduleSettings,
  ShiftChangeHistory,
  CompensatoryDuty,
  AppUserRole,
} from '../types';
import { validateManualAssignment, getDayNameVN, parseDate } from '../services/scheduler';
import { vnDay } from '../services/schoolTime';
import { type Profile } from '../services/api';

interface ShiftAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: ShiftAssignment;
  initialRole?: 'teacher1' | 'teacher2' | 'admin' | 'guard';
  initialTargetEmployeeId?: string;
  initialTargetShiftDate?: string;
  employees: Employee[];
  allShifts: ShiftAssignment[];
  unavailableDates: UnavailableDate[];
  settings: ScheduleSettings;
  currentUserRole?: AppUserRole;
  profile?: Profile;
  onApplyAdjustment: (
    updatedShift: ShiftAssignment,
    historyRecord: Omit<ShiftChangeHistory, 'id' | 'timestamp'>,
    compensatoryDuty?: CompensatoryDuty
  ) => void;
  onRequestSwap?: (params: {
    shiftDate: string;
    targetEmployeeId: string;
    targetShiftDate?: string | null;
    reason: string;
  }) => Promise<void>;
}

export const ShiftAdjustmentModal: React.FC<ShiftAdjustmentModalProps> = ({
  isOpen,
  onClose,
  shift,
  initialRole = 'teacher1',
  initialTargetEmployeeId,
  initialTargetShiftDate,
  employees,
  allShifts,
  unavailableDates,
  settings,
  currentUserRole = 'ADMIN',
  profile,
  onApplyAdjustment,
  onRequestSwap,
}) => {
  const isAdmin = currentUserRole === 'ADMIN';

  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const currentEmployee = profile?.employeeId ? empMap.get(profile.employeeId) : null;

  // Danh sách các ca trực tương lai của nhân sự đang đăng nhập
  const myUpcomingShifts = useMemo(() => {
    if (!profile?.employeeId) return [];
    return allShifts
      .filter(
        (s) =>
          !s.isLocked &&
          s.date >= vnDay() &&
          (s.teacher1Id === profile.employeeId ||
            s.teacher2Id === profile.employeeId ||
            s.adminId === profile.employeeId ||
            s.guardId === profile.employeeId)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allShifts, profile?.employeeId]);

  // Xác định vị trí của nhân sự đang đăng nhập nếu có trong shift ban đầu
  const userPositionInShift = useMemo(() => {
    if (!profile?.employeeId) return null;
    if (shift.teacher1Id === profile.employeeId) return 'teacher1';
    if (shift.teacher2Id === profile.employeeId) return 'teacher2';
    if (shift.adminId === profile.employeeId) return 'admin';
    if (shift.guardId === profile.employeeId) return 'guard';
    return null;
  }, [shift, profile?.employeeId]);

  // Ngày ca trực nguồn của người gửi đề nghị
  const [sourceShiftDate, setSourceShiftDate] = useState<string>(() => {
    if (userPositionInShift) return shift.date;
    return myUpcomingShifts[0]?.date || shift.date;
  });

  const [selectedPosition, setSelectedPosition] = useState<'teacher1' | 'teacher2' | 'admin' | 'guard'>(
    !isAdmin && userPositionInShift ? userPositionInShift : initialRole
  );

  useEffect(() => {
    if (userPositionInShift) {
      setSourceShiftDate(shift.date);
      setSelectedPosition(userPositionInShift);
    } else if (myUpcomingShifts.length > 0) {
      setSourceShiftDate((prev) => {
        if (myUpcomingShifts.some((s) => s.date === prev)) return prev;
        return myUpcomingShifts[0].date;
      });
    }
  }, [shift.date, userPositionInShift, myUpcomingShifts]);

  const [replacementId, setReplacementId] = useState<string>(initialTargetEmployeeId || '');
  const [changeReason, setChangeReason] = useState<string>('');
  const [performerName, setPerformerName] = useState<string>(isAdmin ? 'Ban Giám Hiệu' : (profile?.displayName || 'Nhân viên'));
  const [recordCompensatory, setRecordCompensatory] = useState<boolean>(true);

  // Chế độ đổi ca cho nhân viên: Đổi ca chéo 2 chiều (EXCHANGE) hoặc Nhờ trực thay (COVER)
  const [swapMode, setSwapMode] = useState<'EXCHANGE' | 'COVER'>('EXCHANGE');
  const [targetShiftDate, setTargetShiftDate] = useState<string>(initialTargetShiftDate || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTargetEmployeeId) setReplacementId(initialTargetEmployeeId);
    if (initialTargetShiftDate) setTargetShiftDate(initialTargetShiftDate);
  }, [initialTargetEmployeeId, initialTargetShiftDate]);

  // Ca trực được chọn làm nguồn đổi (đối với Admin là shift, đối với Staff là s theo sourceShiftDate)
  const activeSourceShift = useMemo(() => {
    if (isAdmin) return shift;
    return allShifts.find((s) => s.date === sourceShiftDate) || shift;
  }, [isAdmin, shift, allShifts, sourceShiftDate]);

  // Xác định người hiện tại ở vị trí đã chọn
  const currentPersonId = useMemo(() => {
    if (!isAdmin && profile?.employeeId) {
      return profile.employeeId;
    }
    switch (selectedPosition) {
      case 'teacher1':
        return activeSourceShift.teacher1Id;
      case 'teacher2':
        return activeSourceShift.teacher2Id;
      case 'admin':
        return activeSourceShift.adminId;
      case 'guard':
        return activeSourceShift.guardId;
    }
  }, [isAdmin, profile?.employeeId, selectedPosition, activeSourceShift]);

  const currentPerson = currentPersonId ? empMap.get(currentPersonId) : null;

  // Lọc danh sách nhân sự phù hợp với vị trí / chức vụ
  const candidatePool = useMemo(() => {
    if (!isAdmin) {
      // Nhân viên chỉ được đổi với nhân sự cùng chức vụ:
      // Giáo viên <-> Giáo viên, BGH <-> BGH, Bảo vệ <-> Bảo vệ
      const myRole = currentEmployee?.role;
      return employees.filter(
        (e) => e.isActive && e.id !== profile?.employeeId && (!myRole || e.role === myRole)
      );
    }

    const assignedIdsInThisShift = new Set(
      [activeSourceShift.teacher1Id, activeSourceShift.teacher2Id, activeSourceShift.adminId, activeSourceShift.guardId].filter(Boolean)
    );

    let pool: Employee[] = [];
    if (selectedPosition === 'teacher1' || selectedPosition === 'teacher2') {
      pool = employees.filter((e) => e.role === 'TEACHER');
    } else if (selectedPosition === 'admin') {
      pool = employees.filter((e) => e.role === 'ADMIN');
    } else {
      pool = employees.filter((e) => e.role === 'GUARD');
    }

    return pool.filter((e) => {
      if (!e.isActive) return false;
      if (e.id === currentPersonId) return false;
      if (assignedIdsInThisShift.has(e.id)) return false;
      return true;
    });
  }, [isAdmin, employees, currentEmployee?.role, profile?.employeeId, selectedPosition, currentPersonId, activeSourceShift]);

  // Các ca trực trong tương lai của đồng nghiệp được chọn
  const theirShifts = useMemo(() => {
    if (!replacementId) return [];
    return allShifts
      .filter(
        (s) =>
          !s.isLocked &&
          s.date >= vnDay() &&
          s.date !== sourceShiftDate &&
          (s.teacher1Id === replacementId ||
            s.teacher2Id === replacementId ||
            s.adminId === replacementId ||
            s.guardId === replacementId)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allShifts, replacementId, sourceShiftDate]);

  // Kiểm định điều kiện khi chọn người thay thế (chế độ Admin)
  const validation = useMemo(() => {
    if (!isAdmin) {
      if (!sourceShiftDate) {
        return { isValid: false, errors: ['Vui lòng chọn ca trực của bạn cần đem đổi.'], warnings: [] };
      }
      if (!replacementId) {
        return { isValid: false, errors: ['Vui lòng chọn nhân sự thay thế.'], warnings: [] };
      }
      if (swapMode === 'EXCHANGE' && !targetShiftDate) {
        return { isValid: false, errors: ['Vui lòng chọn ca trực đối ứng của đồng nghiệp.'], warnings: [] };
      }
      return { isValid: true, errors: [], warnings: [] };
    }

    if (!replacementId) {
      return { isValid: false, errors: ['Vui lòng chọn nhân sự thay thế.'], warnings: [] };
    }

    if (replacementId === currentPersonId) {
      return { isValid: false, errors: ['Nhân sự được chọn trùng với người đang trực.'], warnings: [] };
    }

    // Tạo bản sao danh sách shifts tạm thời để kiểm định
    const tempShifts = allShifts.map((s) => {
      if (s.id === activeSourceShift.id) {
        return {
          ...s,
          [selectedPosition === 'teacher1'
            ? 'teacher1Id'
            : selectedPosition === 'teacher2'
            ? 'teacher2Id'
            : selectedPosition === 'admin'
            ? 'adminId'
            : 'guardId']: null,
        };
      }
      return s;
    });

    return validateManualAssignment(
      activeSourceShift.date,
      selectedPosition,
      replacementId,
      tempShifts,
      employees,
      unavailableDates,
      settings
    );
  }, [isAdmin, sourceShiftDate, replacementId, swapMode, targetShiftDate, currentPersonId, activeSourceShift, selectedPosition, allShifts, employees, unavailableDates, settings]);

  if (!isOpen) return null;

  const dObj = parseDate(isAdmin ? shift.date : sourceShiftDate);
  const dayName = getDayNameVN(activeSourceShift.dayOfWeek);
  const formattedDate = `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${dObj.getFullYear()}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAdmin) {
      if (!sourceShiftDate) {
        setStaffError('Vui lòng chọn ca trực của bạn cần đem đổi.');
        return;
      }
      if (!replacementId) {
        setStaffError('Vui lòng chọn đồng nghiệp muốn đổi ca cùng.');
        return;
      }
      if (swapMode === 'EXCHANGE' && !targetShiftDate) {
        setStaffError('Vui lòng chọn ca trực đối ứng của đồng nghiệp.');
        return;
      }
      if (!changeReason.trim()) {
        setStaffError('Vui lòng nhập lý do đổi ca.');
        return;
      }

      setIsSubmitting(true);
      setStaffError(null);
      try {
        if (onRequestSwap) {
          await onRequestSwap({
            shiftDate: sourceShiftDate,
            targetEmployeeId: replacementId,
            targetShiftDate: swapMode === 'EXCHANGE' ? targetShiftDate : null,
            reason: changeReason.trim(),
          });
        }
        onClose();
      } catch (err) {
        setStaffError((err as Error).message || 'Không thể gửi đề nghị đổi ca.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Admin direct override
    if (!validation.isValid || !replacementId) return;

    const updatedShift: ShiftAssignment = {
      ...activeSourceShift,
      [selectedPosition === 'teacher1'
        ? 'teacher1Id'
        : selectedPosition === 'teacher2'
        ? 'teacher2Id'
        : selectedPosition === 'admin'
        ? 'adminId'
        : 'guardId']: replacementId,
    };

    const isComplete =
      updatedShift.teacher1Id &&
      updatedShift.teacher2Id &&
      updatedShift.adminId &&
      updatedShift.guardId;

    updatedShift.status = isComplete ? 'COMPLETE' : 'INCOMPLETE';

    let compDuty: CompensatoryDuty | undefined = undefined;
    if (recordCompensatory && currentPersonId && currentPersonId !== 'EMPTY' && currentPersonId !== replacementId) {
      const nowIso = new Date().toISOString();
      const creditor = empMap.get(replacementId);
      compDuty = {
        id: `comp-${Date.now()}`,
        debtorEmployeeId: currentPersonId,
        creditorEmployeeId: replacementId,
        originalShiftDate: activeSourceShift.date,
        reason: `Đổi ca trực ngày ${activeSourceShift.date} (${changeReason.trim()}) - Được ${creditor?.name} (${creditor?.code}) trực thay`,
        sourceType: 'SHIFT_SWAP',
        status: 'PENDING',
        createdAt: nowIso,
      };
    }

    onApplyAdjustment(
      updatedShift,
      {
        shiftDate: activeSourceShift.date,
        rolePosition: selectedPosition,
        previousEmployeeId: currentPersonId || 'EMPTY',
        newEmployeeId: replacementId,
        reason: changeReason.trim() || 'Điều chỉnh nhân sự theo yêu cầu phân công',
        changedBy: performerName.trim() || 'Ban Giám Hiệu',
      },
      compDuty
    );

    onClose();
  };

  const getPositionLabel = (pos: 'teacher1' | 'teacher2' | 'admin' | 'guard') => {
    switch (pos) {
      case 'teacher1':
        return 'Giáo viên 1';
      case 'teacher2':
        return 'Giáo viên 2';
      case 'admin':
        return 'Ban Giám Hiệu';
      case 'guard':
        return 'Bảo vệ';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                  Điều Chỉnh & Đổi Ca Trực Quản Sinh
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  }`}
                >
                  {isAdmin ? 'Quyền Ban Giám Hiệu' : 'Đổi ca trực (Chỉ cần 2 bên đồng ý)'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Ngày {formattedDate} ({dayName}) · 24 giờ liên tục
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Position Selector (Admin) or Source Shift Picker (Staff) */}
          {isAdmin ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Chọn Vị Trí Cần Thay Đổi
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'teacher1', label: 'Giáo viên 1' },
                    { id: 'teacher2', label: 'Giáo viên 2' },
                    { id: 'admin', label: 'Ban Giám Hiệu' },
                    { id: 'guard', label: 'Bảo vệ' },
                  ] as const
                ).map((pos) => (
                  <button
                    type="button"
                    key={pos.id}
                    onClick={() => {
                      setSelectedPosition(pos.id);
                      setReplacementId('');
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                      selectedPosition === pos.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ca Trực Của Bạn Muốn Đem Đổi <span className="text-rose-500">*</span>
              </label>
              {myUpcomingShifts.length === 0 ? (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  Bạn hiện không có ca trực nào trong tương lai để đem ra đổi.
                </div>
              ) : (
                <select
                  value={sourceShiftDate}
                  onChange={(e) => {
                    setSourceShiftDate(e.target.value);
                    if (targetShiftDate === e.target.value) setTargetShiftDate('');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {myUpcomingShifts.map((s) => {
                    const posLabel =
                      s.teacher1Id === profile?.employeeId
                        ? 'Giáo viên 1'
                        : s.teacher2Id === profile?.employeeId
                        ? 'Giáo viên 2'
                        : s.adminId === profile?.employeeId
                        ? 'Ban Giám Hiệu'
                        : 'Bảo vệ';
                    return (
                      <option key={s.id} value={s.date}>
                        Ca ngày {s.date} ({getDayNameVN(s.dayOfWeek)}) · {posLabel}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          )}

          {/* Current Person Display */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              {isAdmin ? 'Nhân Sự Đang Trực Hiện Tại:' : 'Người Đề Nghị Đổi Ca (Bạn):'}
            </div>
            {currentPerson ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {currentPerson.name} ({currentPerson.code})
                  </div>
                  <div className="text-xs text-slate-500">{currentPerson.department}</div>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  {currentPerson.phone}
                </div>
              </div>
            ) : (
              <div className="text-xs text-rose-500 font-semibold italic">
                (Chưa có nhân sự phân công ở vị trí này)
              </div>
            )}
          </div>

          {/* Select Replacement Candidate */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {isAdmin ? 'Chọn Nhân Sự Thay Thế' : 'Chọn Đồng Nghiệp Cùng Chức Vụ Muốn Đổi'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={replacementId}
              onChange={(e) => {
                setReplacementId(e.target.value);
                setTargetShiftDate('');
              }}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Chọn nhân sự từ danh sách --</option>
              {candidatePool.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.code}) - {candidate.department}
                </option>
              ))}
            </select>
          </div>

          {/* Nhân viên: Chọn hình thức đổi ca đối ứng hoặc nhờ trực thay */}
          {!isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Hình Thức Đổi Ca
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSwapMode('EXCHANGE')}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                    swapMode === 'EXCHANGE'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  Đổi ca đối ứng (2 bên đổi cho nhau)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSwapMode('COVER');
                    setTargetShiftDate('');
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                    swapMode === 'COVER'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  Nhờ trực thay (Ghi nhận nợ ca)
                </button>
              </div>

              {swapMode === 'EXCHANGE' && replacementId && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chọn Ca Trực Đối Ứng Của Đồng Nghiệp (Tất cả các ngày) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={targetShiftDate}
                    onChange={(e) => setTargetShiftDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- Chọn ngày trực đối ứng của đồng nghiệp --</option>
                    {theirShifts.length === 0 ? (
                      <option value="" disabled>
                        Đồng nghiệp chưa có ca trực nào khác trong tương lai
                      </option>
                    ) : (
                      theirShifts.map((s) => (
                        <option key={s.id} value={s.date}>
                          Ca ngày {s.date} ({getDayNameVN(s.dayOfWeek)})
                        </option>
                      ))
                    )}
                  </select>
                  {theirShifts.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      Đồng nghiệp này hiện không có ca trực nào khác để đổi đối ứng. Bạn có thể chọn hình thức "Nhờ trực thay".
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Thông báo lỗi thao tác Staff nếu có */}
          {staffError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{staffError}</span>
            </div>
          )}

          {/* Hộp giải thích quy chế 2 bên đồng ý cho Nhân viên */}
          {!isAdmin && (
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-emerald-800 dark:text-emerald-300">
                  Quy chế đổi ca tự động (Chỉ cần 2 bên đồng ý):
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300/90 leading-relaxed">
                  Sau khi bạn gửi đề nghị, đồng nghiệp sẽ nhận được thông báo.
                  <strong> Ngay khi đồng nghiệp nhấn "Đồng ý", hệ thống sẽ tự động đổi hai ca và cập nhật ngay trên lịch tháng</strong> mà không cần Admin phê duyệt thêm. Cả hai người đều nhận được thông báo kết quả.
                </div>
              </div>
            </div>
          )}

          {/* Real-time Validation Box (chỉ dùng cho Admin) */}
          {isAdmin && replacementId && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                validation.isValid
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {validation.isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Hợp lệ theo toàn bộ quy chế ca trực!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Vi phạm điều kiện bắt buộc - Không thể lưu:</span>
                  </>
                )}
              </div>

              {!validation.isValid && (
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}

              {validation.warnings.length > 0 && (
                <div className="pt-1 text-amber-700 dark:text-amber-400 text-[11px]">
                  {validation.warnings.map((w, i) => (
                    <div key={i}>⚠️ {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Change Reason Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Lý Do Thay Đổi / Đổi Ca <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: Đổi ca do có việc bận gia đình đột xuất, đã trao đổi trước với đồng nghiệp..."
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Performer (Admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Người Thực Hiện / Phê Duyệt Thay Đổi
              </label>
              <input
                type="text"
                value={performerName}
                onChange={(e) => setPerformerName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Record Compensatory Duty Checkbox (Admin only) */}
          {isAdmin && currentPerson && currentPersonId !== replacementId && (
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-xl">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordCompensatory}
                  onChange={(e) => setRecordCompensatory(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Ghi nhận nghĩa vụ Trực Bù cho {currentPerson.name}
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Hệ thống sẽ lưu vết nợ ca (ghi nhận chính xác giây:phút:giờ) để phân công trực bù sau này.
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>

            {isAdmin ? (
              <button
                type="submit"
                disabled={!validation.isValid || !changeReason.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer ${
                  validation.isValid && changeReason.trim()
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                Xác Nhận & Lưu Nhật Ký
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !sourceShiftDate ||
                  !replacementId ||
                  (swapMode === 'EXCHANGE' && !targetShiftDate) ||
                  !changeReason.trim()
                }
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-xs transition-colors ${
                  !isSubmitting &&
                  sourceShiftDate &&
                  replacementId &&
                  (swapMode !== 'EXCHANGE' || targetShiftDate) &&
                  changeReason.trim()
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmitting ? 'Đang gửi đề nghị...' : 'Gửi Đề Nghị Đổi Ca (Chờ Đồng Ý)'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
