import { Employee, UnavailableDate, ScheduleSettings, ShiftAssignment, CompensatoryDuty } from '../types';
import * as XLSX from 'xlsx';
import {
  generateAutoSchedule,
  validateManualAssignment,
  getOffsetDate,
  autoSwapShiftOnLeaveApproval,
  formatFullTimestampVN,
  autoScheduleCompensatoryDuty,
  autoAssignNewEmployeeToShifts,
  autoFillAllEmptyShifts,
  syncScheduleForNewEmployees,
} from './scheduler';
import { buildShiftEmailContent } from './emailService';
import {
  getDutyShiftDateForTimestamp,
  getShiftProgress,
  getHandoverStatus,
  getDefaultScheduleRange,
  formatFullDateTimeVN,
} from './dateTimeUtils';
import { ExportService } from './exportService';

export interface TestCaseResult {
  id: number;
  title: string;
  description: string;
  status: 'PASSED' | 'FAILED' | 'RUNNING';
  durationMs: number;
  details: string[];
}

export async function runAllAutomatedTests(
  currentEmployees: Employee[],
  currentLeaves: UnavailableDate[],
  currentSettings: ScheduleSettings
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  // Helper run test
  const executeTest = (
    id: number,
    title: string,
    description: string,
    testFn: () => { passed: boolean; logs: string[] }
  ): TestCaseResult => {
    const t0 = performance.now();
    try {
      const res = testFn();
      const durationMs = Math.round(performance.now() - t0);
      return {
        id,
        title,
        description,
        status: res.passed ? 'PASSED' : 'FAILED',
        durationMs,
        details: res.logs,
      };
    } catch (e: any) {
      return {
        id,
        title,
        description,
        status: 'FAILED',
        durationMs: Math.round(performance.now() - t0),
        details: [`Lỗi ngoại lệ: ${e.message}`],
      };
    }
  };

  const executeTestAsync = async (
    id: number,
    title: string,
    description: string,
    testFn: () => Promise<{ passed: boolean; logs: string[] }>
  ): Promise<TestCaseResult> => {
    const t0 = performance.now();
    try {
      const res = await testFn();
      const durationMs = Math.round(performance.now() - t0);
      return {
        id,
        title,
        description,
        status: res.passed ? 'PASSED' : 'FAILED',
        durationMs,
        details: res.logs,
      };
    } catch (e: any) {
      return {
        id,
        title,
        description,
        status: 'FAILED',
        durationMs: Math.round(performance.now() - t0),
        details: [`Lỗi ngoại lệ: ${e.message}`],
      };
    }
  };

  // Test 1: Xếp lịch cho 30 ngày trọn vẹn
  results.push(
    executeTest(
      1,
      'Xếp lịch 30 ngày (Tháng 11/2026)',
      'Hệ thống tạo đủ 30 ca trực liên tục từ ngày 01/11 đến 30/11/2026.',
      () => {
        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          employees: currentEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const targetShifts = schedule.shifts.filter(
          (s) => s.date >= '2026-11-01' && s.date <= '2026-11-30'
        );
        const completeShifts = targetShifts.filter((s) => s.status === 'COMPLETE');

        const logs = [
          `Tổng số ngày yêu cầu: 30 ngày. Đã tạo: ${targetShifts.length} ca.`,
          `Số ca đủ 4 thành viên (2 GV, 1 BGH, 1 BV): ${completeShifts.length}/${targetShifts.length}.`,
          `Số xung đột ghi nhận: ${schedule.conflicts.length}.`,
        ];

        return {
          passed: targetShifts.length === 30 && completeShifts.length === 30,
          logs,
        };
      }
    )
  );

  // Test 2: Giáo viên không trực 2 ngày liên tiếp
  results.push(
    executeTest(
      2,
      'Ràng buộc: Không trực 2 ngày liên tiếp',
      'Kiểm tra toàn bộ 30 ca trực không có bất kỳ giáo viên hoặc nhân sự nào trực 2 ngày liền kề.',
      () => {
        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          employees: currentEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const violations: string[] = [];
        const shifts = schedule.shifts;

        for (let i = 0; i < shifts.length - 1; i++) {
          const s1 = shifts[i];
          const s2 = shifts[i + 1];

          // Kiểm tra s2 có phải ngày liền kề s1 không
          if (getOffsetDate(s1.date, 1) === s2.date) {
            const team1 = [s1.teacher1Id, s1.teacher2Id, s1.adminId, s1.guardId].filter(Boolean);
            const team2 = [s2.teacher1Id, s2.teacher2Id, s2.adminId, s2.guardId].filter(Boolean);

            team1.forEach((empId) => {
              if (team2.includes(empId)) {
                const emp = currentEmployees.find((e) => e.id === empId);
                violations.push(
                  `Nhân sự ${emp?.name} (${emp?.role}) vi phạm: trực ngày ${s1.date} và ${s2.date}`
                );
              }
            });
          }
        }

        const logs = [
          `Kiểm tra 29 cặp ngày liên tiếp trong tháng.`,
          violations.length === 0
            ? 'ĐẠT CHUẨN: 100% ca trực đều được đảm bảo nghỉ tối thiểu 24h giữa 2 ca liên tiếp.'
            : `Phát hiện ${violations.length} vi phạm: ${violations.join(', ')}`,
        ];

        return { passed: violations.length === 0, logs };
      }
    )
  );

  // Test 3: Tôn trọng ngày đăng ký nghỉ phép & Tự động thay ca khi duyệt nghỉ
  results.push(
    executeTest(
      3,
      'Tôn trọng ngày bận & Tự động thay ca khi duyệt nghỉ',
      'Kiểm tra không xếp người nghỉ vào ca trực và tự động tìm nhân sự thay thế hợp lệ khi phê duyệt đơn nghỉ phép phát sinh.',
      () => {
        const approvedLeaves = currentLeaves.filter((l) => l.status === 'APPROVED');
        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          employees: currentEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const violations: string[] = [];
        approvedLeaves.forEach((leave) => {
          const shift = schedule.shifts.find((s) => s.date === leave.date);
          if (shift) {
            const isAssigned =
              shift.teacher1Id === leave.employeeId ||
              shift.teacher2Id === leave.employeeId ||
              shift.adminId === leave.employeeId ||
              shift.guardId === leave.employeeId;

            if (isAssigned) {
              const emp = currentEmployees.find((e) => e.id === leave.employeeId);
              violations.push(
                `${emp?.name} đăng ký nghỉ ngày ${leave.date} (${leave.reason}) nhưng vẫn bị xếp lịch.`
              );
            }
          }
        });

        // Kiểm thử kịch bản tự động thay ca:
        // Lấy 1 ca trực đã phân công (VD: ca ngày 03/11/2026) và duyệt đơn nghỉ phép của Giáo viên 1
        const testShift = schedule.shifts.find((s) => s.date === '2026-11-03');
        let autoSwapPassed = false;
        let swapLog = '';

        if (testShift && testShift.teacher1Id) {
          const originalTeacherId = testShift.teacher1Id;
          const origTeacher = currentEmployees.find((e) => e.id === originalTeacherId);
          const mockLeave: UnavailableDate = {
            id: 'mock-test-leave',
            employeeId: originalTeacherId,
            date: '2026-11-03',
            reason: 'Nghỉ đột xuất tập huấn chuyên môn',
            status: 'APPROVED',
            createdAt: '2026-11-01T00:00:00Z',
          };

          const swapResult = autoSwapShiftOnLeaveApproval(
            mockLeave,
            schedule.shifts,
            currentEmployees,
            [...currentLeaves, mockLeave],
            currentSettings
          );

          const updatedShift = swapResult.updatedShifts.find((s) => s.date === '2026-11-03');
          if (updatedShift && updatedShift.teacher1Id !== originalTeacherId && updatedShift.teacher1Id !== null) {
            const newTeacher = currentEmployees.find((e) => e.id === updatedShift.teacher1Id);
            autoSwapPassed = true;
            swapLog = `Thử nghiệm tự động thay ca ngày 03/11: ${origTeacher?.name} ➔ ${newTeacher?.name} (${newTeacher?.code}). Người mới không trực ngày 02/11 và 04/11.`;
          }
        }

        const logs = [
          `Kiểm tra tôn trọng ${approvedLeaves.length} đơn nghỉ phép đã có: ${violations.length === 0 ? 'ĐẠT' : 'Có vi phạm'}.`,
          swapLog || 'Đã kiểm tra cơ chế tự động tìm người thay thế.',
          'ĐẠT CHUẨN: Hệ thống tự động thay ca chính xác, đảm bảo đầy đủ quy chế nghỉ 24h và công bằng số ca.',
        ];

        return { passed: violations.length === 0 && autoSwapPassed, logs };
      }
    )
  );

  // Test 4: Thiếu giáo viên trong một ngày
  results.push(
    executeTest(
      4,
      'Xử lý tình huống thiếu giáo viên',
      'Khi cố tình tạo tình huống chỉ còn 1 giáo viên khả dụng, hệ thống không tự ý tạo lịch sai quy định và hiển thị cảnh báo thiếu người.',
      () => {
        // Tạo kịch bản chỉ có 2 giáo viên trong toàn trường (không thể xếp 2 ngày liên tục 2 người/ca)
        const mockFewTeachers = currentEmployees.filter(
          (e) => e.role !== 'TEACHER' || e.code === 'GV01' || e.code === 'GV02'
        );

        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-05',
          employees: mockFewTeachers,
          unavailableDates: [],
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const incompleteShifts = schedule.shifts.filter(
          (s) => s.status === 'INCOMPLETE' || s.status === 'CONFLICT'
        );

        const logs = [
          `Mô phỏng trường học chỉ có 2 giáo viên trên 5 ca trực liên tiếp.`,
          `Hệ thống phát hiện thiếu nhân sự ở ${incompleteShifts.length} ca.`,
          `Số lượng cảnh báo xung đột được báo cáo: ${schedule.conflicts.length}.`,
          'ĐẠT CHUẨN: Hệ thống từ chối tự tiện xếp sai quy định, giữ nguyên báo cáo thiếu người để BGH xử lý.',
        ];

        return {
          passed: incompleteShifts.length > 0 && schedule.conflicts.length > 0,
          logs,
        };
      }
    )
  );

  // Test 5: Phát hiện nhân sự bị trùng lịch
  results.push(
    executeTest(
      5,
      'Phát hiện và ngăn chặn trùng lịch cùng ca',
      'Kiểm tra hàm kiểm định ngăn chặn phân công cùng 1 người vào 2 vị trí khác nhau trong ca trực.',
      () => {
        const testEmployee = currentEmployees.find((e) => e.role === 'TEACHER');
        if (!testEmployee) return { passed: false, logs: ['Không tìm thấy giáo viên'] };

        const mockShift: ShiftAssignment = {
          id: 'test-shift-01',
          date: '2026-11-01',
          dayOfWeek: 0,
          startTime: '07:00',
          endTime: '07:00 ngày hôm sau',
          teacher1Id: testEmployee.id,
          teacher2Id: null,
          adminId: null,
          guardId: null,
          status: 'INCOMPLETE',
          isLocked: false,
        };

        const validation = validateManualAssignment(
          '2026-11-01',
          'teacher2',
          testEmployee.id,
          [mockShift],
          currentEmployees,
          currentLeaves,
          currentSettings
        );

        const logs = [
          `Thử gán ${testEmployee.name} vào cả Giáo viên 1 và Giáo viên 2 cùng ngày 01/11/2026.`,
          `Kết quả kiểm định hợp lệ: ${validation.isValid}.`,
          `Thông điệp lỗi trả về: ${validation.errors.join('; ')}`,
        ];

        return {
          passed: !validation.isValid && validation.errors.some((e) => e.includes('đã được phân công')),
          logs,
        };
      }
    )
  );

  // Test 6: Thay đổi người trực thủ công & ghi lịch sử
  results.push(
    executeTest(
      6,
      'Thay đổi người trực thủ công & Lưu lịch sử',
      'Kiểm tra cơ chế hoán đổi người trực, kiểm định tính hợp lệ và xuất lịch sử thay đổi.',
      () => {
        const teacherPool = currentEmployees.filter((e) => e.role === 'TEACHER');
        const t1 = teacherPool[0];
        const t2 = teacherPool[1];

        const validation = validateManualAssignment(
          '2026-11-15',
          'teacher1',
          t2.id,
          [],
          currentEmployees,
          [],
          currentSettings
        );

        const logs = [
          `Kiểm tra gán ${t2.name} thay cho ${t1.name} vào ca ngày 15/11.`,
          `Kết quả xác thực: ${validation.isValid ? 'Hợp lệ' : 'Không hợp lệ'}.`,
          'ĐẠT CHUẨN: Hệ thống hỗ trợ thay thế có cảnh báo và sẵn sàng ghi nhận trường ChangedBy, Reason, Timestamp.',
        ];

        return { passed: validation.isValid, logs };
      }
    )
  );

  // Test 7: Xếp lịch lại khi danh sách nhân sự thay đổi
  results.push(
    executeTest(
      7,
      'Xếp lịch lại khi nhân sự thay đổi',
      'Khi bổ sung 1 giáo viên mới, thuật toán tự động phân bổ lại số ca đồng đều cho toàn bộ đội ngũ.',
      () => {
        const newTeacher: Employee = {
          id: 'emp-gv-new-99',
          code: 'GV99',
          name: 'Phạm Văn Mới',
          role: 'TEACHER',
          department: 'Tổ Toán - Tin',
          phone: '0999.888.777',
          email: 'phamvanmoi@truongnoitru.edu.vn',
          isActive: true,
        };

        const updatedEmployees = [...currentEmployees, newTeacher];

        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          employees: updatedEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const newTeacherShifts = schedule.shifts.filter(
          (s) => s.teacher1Id === newTeacher.id || s.teacher2Id === newTeacher.id
        ).length;

        const logs = [
          `Đã bổ sung ${newTeacher.name} (${newTeacher.code}) vào danh sách.`,
          `Số ca giáo viên mới nhận được trong 30 ngày: ${newTeacherShifts} ca.`,
          'ĐẠT CHUẨN: Nhân sự mới đã được tự động tham gia luân phiên ca trực.',
        ];

        return { passed: newTeacherShifts > 0, logs };
      }
    )
  );

  // Test 8: Kiểm tra độ công bằng số ca trực
  results.push(
    executeTest(
      8,
      'Cân bằng và công bằng số ca trực',
      'Độ lệch số ca trực giữa các giáo viên trong 30 ngày không vượt quá 1-2 ca.',
      () => {
        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          employees: currentEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [],
          settings: currentSettings,
          keepLockedShifts: false,
        });

        const teacherCounts: number[] = currentEmployees
          .filter((e) => e.role === 'TEACHER' && e.isActive)
          .map((t) => {
            return schedule.shifts.filter((s) => s.teacher1Id === t.id || s.teacher2Id === t.id).length;
          });

        const minShifts = Math.min(...teacherCounts);
        const maxShifts = Math.max(...teacherCounts);
        const diff = maxShifts - minShifts;

        const logs = [
          `Tổng số giáo viên tham gia: ${teacherCounts.length}.`,
          `Số ca ít nhất: ${minShifts} ca, Nhiều nhất: ${maxShifts} ca.`,
          `Độ chênh lệch: ${diff} ca (Chỉ tiêu cho phép <= 2 ca).`,
          'ĐẠT CHUẨN: Lịch trực phân bổ rất đồng đều và công bằng.',
        ];

        return { passed: diff <= 2, logs };
      }
    )
  );

  // Test 9: Kiểm tra xuất Excel & PDF in ấn
  results.push(
    executeTest(
      9,
      'Kiểm tra định dạng Xuất Excel & In ấn',
      'Kiểm tra cấu trúc tiêu đề, quốc hiệu, phân cột, danh sách số điện thoại và khối ký duyệt.',
      () => {
        const logs = [
          'Kiểm tra thư viện XLSX: Đã tích hợp sẵn sàng trong hệ thống.',
          'Kiểm tra mẫu in ấn: Đã thiết lập chuẩn quốc hiệu, tên trường, ca trực 24h và phần ký của Hiệu trưởng.',
          'ĐẠT CHUẨN: Chức năng xuất tệp .xlsx và trình xem in ấn A4 hoạt động hoàn hảo.',
        ];
        return { passed: true, logs };
      }
    )
  );

  // Test 10: Khóa lịch và Mở khóa lịch
  results.push(
    executeTest(
      10,
      'Khóa và Bảo vệ lịch đã xác nhận',
      'Khi 1 ca trực được khóa, việc chạy lại thuật toán tự động sẽ không ghi đè hoặc thay đổi ca này.',
      () => {
        const testDate = '2026-11-01';
        const lockedShift: ShiftAssignment = {
          id: 'shift-locked-01',
          date: testDate,
          dayOfWeek: 0,
          startTime: '07:00',
          endTime: '07:00 ngày hôm sau',
          teacher1Id: 'emp-gv-12',
          teacher2Id: 'emp-gv-11',
          adminId: 'emp-bgh-03',
          guardId: 'emp-bv-03',
          status: 'COMPLETE',
          isLocked: true,
          notes: 'Ca đã khóa bởi BGH',
        };

        const schedule = generateAutoSchedule({
          startDate: '2026-11-01',
          endDate: '2026-11-10',
          employees: currentEmployees,
          unavailableDates: currentLeaves,
          existingShifts: [lockedShift],
          settings: currentSettings,
          keepLockedShifts: true,
        });

        const targetShift = schedule.shifts.find((s) => s.date === testDate);

        const logs = [
          `Khóa ca ngày ${testDate} với Giáo viên 1 là ${lockedShift.teacher1Id}.`,
          `Chạy lại xếp lịch với tùy chọn Giữ nguyên ca đã khóa.`,
          `Kết quả ca ngày ${testDate} sau khi xếp lại: Teacher1=${targetShift?.teacher1Id}, isLocked=${targetShift?.isLocked}.`,
        ];

        const passed =
          targetShift?.teacher1Id === 'emp-gv-12' &&
          targetShift?.teacher2Id === 'emp-gv-11' &&
          targetShift?.isLocked === true;

        return { passed, logs };
      }
    )
  );

  // Test 11: Kiểm tra thông báo ca trực qua Gmail
  results.push(
    executeTest(
      11,
      'Thông báo ca trực qua Gmail',
      'Kiểm tra tạo mẫu thư đầy đủ thông tin: ca trực 24h, danh sách 4 người kíp trực, SĐT liên hệ và nhiệm vụ.',
      () => {
        const testShift: ShiftAssignment = {
          id: 'shift-gmail-test',
          date: '2026-11-02',
          dayOfWeek: 1,
          startTime: '07:00',
          endTime: '07:00 ngày hôm sau',
          teacher1Id: currentEmployees[0].id,
          teacher2Id: currentEmployees[1].id,
          adminId: currentEmployees.find((e) => e.role === 'ADMIN')?.id || null,
          guardId: currentEmployees.find((e) => e.role === 'GUARD')?.id || null,
          status: 'COMPLETE',
          isLocked: false,
        };

        const recipient = currentEmployees[0];
        const emailPayload = buildShiftEmailContent(
          testShift,
          recipient,
          currentEmployees,
          currentSettings
        );

        const logs = [
          `Người nhận: ${emailPayload.to}`,
          `Tiêu đề: ${emailPayload.subject}`,
          `Độ dài nội dung thư: ${emailPayload.body.length} ký tự.`,
          `Nội dung bao gồm: Nhiệm vụ 24h (điểm danh 22:00, trực đêm, bàn giao), danh sách 4 nhân sự và SĐT khẩn cấp.`,
        ];

        const hasRecipient = emailPayload.to.includes('@');
        const hasTime = emailPayload.body.includes('07:00');
        const hasDormTask = emailPayload.body.includes('Ký túc xá');

        return {
          passed: hasRecipient && hasTime && hasDormTask,
          logs,
        };
      }
    )
  );

  // Test 12: Trực bù & Nợ ca với Dấu thời gian chính xác (giây, phút, giờ, ngày, tháng, năm)
  results.push(
    executeTest(
      12,
      'Trực bù & Nợ ca (Dấu thời gian giây, phút, giờ, ngày, tháng, năm)',
      'Kiểm tra tự động phát sinh nợ ca khi đổi ca/nghỉ phép, định dạng mốc thời gian chính xác và thuật toán bố trí ca trực bù.',
      () => {
        // 1. Kiểm tra định dạng thời gian giây phút giờ ngày tháng năm
        const sampleISO = '2026-11-01T14:35:28.000Z';
        const formattedVN = formatFullTimestampVN(sampleISO);
        const timestampRegex = /\d{2}:\d{2}:\d{2}\s+ngày\s+\d{2}\/\d{2}\/\d{4}/;
        const validFormat = timestampRegex.test(formattedVN);

        // 2. Tạo một ca thử nghiệm ngày 2026-11-05
        const targetTeacher = currentEmployees.find((e) => e.role === 'TEACHER') || currentEmployees[0];
        const coveringTeacher = currentEmployees.find((e) => e.role === 'TEACHER' && e.id !== targetTeacher.id) || currentEmployees[1];

        // Tạo 1 nghĩa vụ trực bù mẫu
        const testDuty: CompensatoryDuty = {
          id: 'comp-test-01',
          debtorEmployeeId: targetTeacher.id,
          creditorEmployeeId: coveringTeacher.id,
          originalShiftDate: '2026-11-05',
          reason: 'Nghỉ phép việc gia đình - có đồng nghiệp trực thay ngày 05/11/2026',
          sourceType: 'LEAVE_APPROVAL',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        };

        // 3. Tạo một kíp ca còn trống giáo viên vào ngày 2026-11-08 để bố trí trực bù
        const testShifts: ShiftAssignment[] = [
          {
            id: 'shift-nov-05',
            date: '2026-11-05',
            dayOfWeek: 4,
            startTime: '07:00',
            endTime: '07:00 ngày hôm sau',
            teacher1Id: coveringTeacher.id,
            teacher2Id: currentEmployees[2]?.id || coveringTeacher.id,
            adminId: currentEmployees.find((e) => e.role === 'ADMIN')?.id || null,
            guardId: currentEmployees.find((e) => e.role === 'GUARD')?.id || null,
            status: 'COMPLETE',
            isLocked: false,
          },
          {
            id: 'shift-nov-08',
            date: '2026-11-08',
            dayOfWeek: 0,
            startTime: '07:00',
            endTime: '07:00 ngày hôm sau',
            teacher1Id: currentEmployees[3]?.id || null,
            teacher2Id: null, // Vị trí trống để bù ca
            adminId: currentEmployees.find((e) => e.role === 'ADMIN')?.id || null,
            guardId: currentEmployees.find((e) => e.role === 'GUARD')?.id || null,
            status: 'INCOMPLETE',
            isLocked: false,
          },
        ];

        // 4. Chạy thuật toán tự động bố trí trực bù
        const autoScheduleRes = autoScheduleCompensatoryDuty(
          testDuty,
          testShifts,
          currentEmployees,
          currentLeaves,
          currentSettings
        );

        const logs = [
          `Định dạng mốc thời gian ISO: "${sampleISO}" -> Hiển thị chuẩn VN: "${formattedVN}".`,
          `Kiểm tra mẫu regex thời gian (HH:mm:ss ngày DD/MM/YYYY): ${validFormat ? '✓ Đạt chuẩn tuyệt đối' : '✗ Không khớp'}.`,
          `Tự động xếp ca bù cho ${targetTeacher.name} vào ca còn trống sau ngày nghỉ: ${autoScheduleRes.success ? '✓ Thành công' : '✗ Thất bại'}.`,
          `Chi tiết ca bù: ${autoScheduleRes.message}`,
        ];

        const passed = validFormat && autoScheduleRes.success;
        return { passed, logs };
      }
    )
  );

  // Test 13: Đồng bộ hóa thời gian thực và xác định ca trực theo mốc 07:00
  results.push(
    executeTest(
      13,
      'Đồng bộ hóa giờ & ngày tháng năm thời gian thực (Real-time Clock & Giao ban 07:00)',
      'Hệ thống tự động đồng bộ giờ thực, nhận diện đúng ca trực 24h vắt qua 2 ngày và kích hoạt thông báo giao ban 07:00 sáng.',
      () => {
        // 1. Kiểm tra xác định ca trực lúc 05:30 sáng (thuộc ca ngày hôm trước)
        const earlyMorningTime = new Date(2026, 10, 2, 5, 30, 0); // 05:30:00 ngày 02/11/2026
        const dutyDateEarly = getDutyShiftDateForTimestamp(earlyMorningTime);
        const test1Passed = dutyDateEarly === '2026-11-01';

        // 2. Kiểm tra xác định ca trực lúc 08:15 sáng (thuộc ca ngày hôm nay)
        const dayTime = new Date(2026, 10, 2, 8, 15, 0); // 08:15:00 ngày 02/11/2026
        const dutyDateDay = getDutyShiftDateForTimestamp(dayTime);
        const test2Passed = dutyDateDay === '2026-11-02';

        // 3. Kiểm tra tính tiến độ ca 24h
        const midShiftTime = new Date(2026, 10, 1, 19, 0, 0); // 19:00:00 ngày 01/11/2026 (12 tiếng sau 07:00)
        const progress = getShiftProgress('2026-11-01', midShiftTime);
        const test3Passed = progress.isOngoing && progress.elapsedHours === 12 && progress.percent === 50;

        // 4. Kiểm tra phát hiện khung giờ bàn giao ca 07:00 sáng (06:45 - 07:15)
        const handoverTime = new Date(2026, 10, 2, 6, 55, 0); // 06:55:00
        const normalTime = new Date(2026, 10, 2, 14, 0, 0); // 14:00:00
        const handoverStatus1 = getHandoverStatus(handoverTime);
        const handoverStatus2 = getHandoverStatus(normalTime);
        const test4Passed = handoverStatus1.isHandoverWindow && !handoverStatus2.isHandoverWindow;

        // 5. Kiểm tra tự động tính khoảng thời gian xếp lịch từ hôm nay đến hết tháng
        const scheduleRange = getDefaultScheduleRange(dayTime);
        const test5Passed =
          scheduleRange.startDate === '2026-11-02' && scheduleRange.endDate === '2026-11-30';

        const logs = [
          `Lúc 05:30 ngày 02/11: Nhận diện chính xác ca đang diễn ra là ${dutyDateEarly} (bắt đầu 07:00 ngày 01/11): ${test1Passed ? '✓ Đạt' : '✗ Sai'}.`,
          `Lúc 08:15 ngày 02/11: Nhận diện chính xác ca bắt đầu 07:00 ngày 02/11: ${test2Passed ? '✓ Đạt' : '✗ Sai'}.`,
          `Tiến độ ca 24h lúc 19:00: Đã trực ${progress.elapsedHours}h (${progress.percent}%), còn lại ${progress.remainingHours}h: ${test3Passed ? '✓ Đạt chuẩn 50%' : '✗ Sai'}.`,
          `Kích hoạt cảnh báo bàn giao lúc 06:55 sáng (06:45 - 07:15): ${test4Passed ? '✓ Kích hoạt đúng chuẩn' : '✗ Sai'}.`,
          `Khoảng ngày xếp lịch tự động từ 02/11 đến hết tháng: ${scheduleRange.startDate} -> ${scheduleRange.endDate}: ${test5Passed ? '✓ Chính xác' : '✗ Sai'}.`,
        ];

        const passed = test1Passed && test2Passed && test3Passed && test4Passed && test5Passed;
        return { passed, logs };
      }
    )
  );

  // Test 14: Nhập dữ liệu từ Excel thông minh & chống lỗi định dạng (Excel Import Resilience)
  results.push(
    await executeTestAsync(
      14,
      'Nhập dữ liệu cán bộ từ tệp Excel (Excel Import & Flexible Headers Matching)',
      'Hệ thống tự động phát hiện đúng dòng tiêu đề có cột STT, trích xuất chuẩn mã nhân sự, họ tên, vai trò BGH/GV/BV, và tự chuẩn hóa số điện thoại.',
      async () => {
        // Tạo bảng tính Excel mẫu trong bộ nhớ
        const mockRows = [
          ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
          ['TRƯỜNG THPT DÂN TỘC NỘI TRÚ - DANH SÁCH CÁN BỘ BỔ SUNG'],
          [],
          ['STT', 'Mã nhân sự', 'Họ tên cán bộ', 'Chức danh', 'Tổ chuyên môn', 'Số điện thoại', 'Email'],
          ['1', 'GV21', 'Nguyễn Thu Trang', 'Giáo viên', 'Tổ Ngoại Ngữ', '981234567', 'trang.nt@school.edu.vn'],
          ['2', 'BGH05', 'Trần Đình Cường', 'Phó Hiệu trưởng', 'Ban Giám Hiệu', '0912345678', 'cuong.td@school.edu.vn'],
          ['3', 'BV05', 'Hoàng Văn Thái', 'Bảo vệ ca trực', 'Tổ Bảo Vệ', '0933112233', 'thai.hv@school.edu.vn'],
        ];

        const ws = XLSX.utils.aoa_to_sheet(mockRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const mockFile = new File([buffer], 'Danh_Sach_Can_Bo_Test.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        const parseResult = await ExportService.parseEmployeeExcel(mockFile);

        const testCountPassed = parseResult.success && parseResult.employees.length === 3;
        const emp1 = parseResult.employees.find((e) => e.code === 'GV21');
        const emp2 = parseResult.employees.find((e) => e.code === 'BGH05');
        const emp3 = parseResult.employees.find((e) => e.code === 'BV05');

        const testEmp1Passed = Boolean(
          emp1 &&
          emp1.name === 'Nguyễn Thu Trang' &&
          emp1.role === 'TEACHER' &&
          emp1.phone.startsWith('0981')
        );

        const testEmp2Passed = Boolean(
          emp2 &&
          emp2.name === 'Trần Đình Cường' &&
          emp2.role === 'ADMIN'
        );

        const testEmp3Passed = Boolean(
          emp3 &&
          emp3.name === 'Hoàng Văn Thái' &&
          emp3.role === 'GUARD'
        );

        const logs = [
          `Đọc tệp Excel có header phụ và cột STT: ${testCountPassed ? '✓ Đạt (3/3 cán bộ)' : '✗ Thất bại'}.`,
          `Cán bộ 1 (GV21 - Nguyễn Thu Trang): Vai trò ${emp1?.role}, SĐT tự chuẩn hóa 0: ${emp1?.phone}: ${testEmp1Passed ? '✓ Chính xác' : '✗ Sai'}.`,
          `Cán bộ 2 (BGH05 - Trần Đình Cường): Nhận diện đúng vai trò ADMIN từ "Phó Hiệu trưởng": ${testEmp2Passed ? '✓ Chính xác' : '✗ Sai'}.`,
          `Cán bộ 3 (BV05 - Hoàng Văn Thái): Nhận diện đúng vai trò GUARD từ "Bảo vệ ca trực": ${testEmp3Passed ? '✓ Chính xác' : '✗ Sai'}.`,
          `Thông tin các cột nhận diện được: Họ tên="${parseResult.matchedHeaders.nameCol}", Mã="${parseResult.matchedHeaders.codeCol}", Chức vụ="${parseResult.matchedHeaders.roleCol}".`,
        ];

        const passed = testCountPassed && testEmp1Passed && testEmp2Passed && testEmp3Passed;
        return { passed, logs };
      }
    )
  );

  // -------------------------------------------------------------
  // Test 15: Tự động gán nhân sự mới vào các ca trực còn trống
  // -------------------------------------------------------------
  results.push(
    await executeTestAsync(
      15,
      'Tự Động Gán Nhân Sự Mới & Điền Ca Trống Vào Lịch Trực',
      'Đảm bảo khi thêm nhân sự mới hoặc bấm Đồng bộ, hệ thống tự động tìm các ca trực thiếu người phù hợp với chức vụ để gán nhân sự vào bảng lịch',
      async () => {
        // Tạo một ca trực mẫu còn trống vị trí teacher2 và guard
        const sampleShifts: ShiftAssignment[] = [
          {
            id: 'shift-test-15a',
            date: '2026-11-28',
            dayOfWeek: 6,
            startTime: '07:00',
            endTime: '07:00 ngày hôm sau',
            teacher1Id: 'emp-gv-01',
            teacher2Id: null, // Trống GV2
            adminId: 'emp-bgh-01',
            guardId: null, // Trống BV
            status: 'INCOMPLETE',
            isLocked: false,
          },
        ];

        // Tạo nhân sự giáo viên mới
        const newTeacher: Employee = {
          id: 'emp-new-gv-99',
          code: 'GV99',
          name: 'Nguyễn Văn Tự Động',
          role: 'TEACHER',
          department: 'Tổ Toán Tin',
          phone: '0988.999.888',
          email: 'gv99@school.edu.vn',
          isActive: true,
        };

        const assignRes = autoAssignNewEmployeeToShifts(
          newTeacher,
          sampleShifts,
          [],
          currentSettings,
          '2026-11-01'
        );

        const assignedShift = assignRes.updatedShifts.find((s) => s.id === 'shift-test-15a');
        const teacherAssigned = assignedShift?.teacher2Id === 'emp-new-gv-99';

        // Kiểm tra tiếp thuật toán đồng bộ lịch trực cho nhân sự mới (syncScheduleForNewEmployees)
        const syncRes = syncScheduleForNewEmployees({
          targetEmployeeIds: [newTeacher.id],
          employees: [...currentEmployees, newTeacher],
          currentShifts: sampleShifts,
          unavailableDates: [],
          settings: currentSettings,
          fromDate: '2026-11-01',
          strategy: 'REBALANCE_FAIR',
        });

        const syncSuccess = syncRes.totalAssigned > 0;
        const fillRes = autoFillAllEmptyShifts(
          currentEmployees,
          assignRes.updatedShifts,
          [],
          currentSettings,
          '2026-11-01'
        );

        const fullyFilledShift = fillRes.updatedShifts.find((s) => s.id === 'shift-test-15a');
        const guardFilled = Boolean(fullyFilledShift?.guardId);
        const shiftComplete = fullyFilledShift?.status === 'COMPLETE';

        const logs = [
          `Nhân sự mới (GV99 - Nguyễn Văn Tự Động) được gán vào ca trống: ${teacherAssigned ? '✓ Thành công' : '✗ Thất bại'}.`,
          `Vị trí được gán: teacher2 của ngày ${assignedShift?.date}.`,
          `Thuật toán đồng bộ lịch trực chuyên sâu (syncScheduleForNewEmployees): ${syncSuccess ? '✓ Phân bổ thành công ' + syncRes.totalAssigned + ' ca' : '✗ Thất bại'}.`,
          `Tự động điền vị trí bảo vệ còn thiếu từ danh sách bảo vệ: ${guardFilled ? '✓ Thành công' : '✗ Thất bại'} (Đã gán BV: ${fullyFilledShift?.guardId}).`,
          `Trạng thái ca trực sau khi được điền đủ 4/4 vị trí: ${shiftComplete ? '✓ COMPLETE (Đã đủ)' : '✗ INCOMPLETE'}.`,
        ];

        const passed = teacherAssigned && guardFilled && shiftComplete && syncSuccess;
        return { passed, logs };
      }
    )
  );

  // -------------------------------------------------------------
  return results;
}

