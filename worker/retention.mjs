import { query } from './database.mjs';
import { backupStorage } from './backup.mjs';

/**
 * Tính toán mốc ngày cắt dữ liệu (retention cutoff):
 * Chỉ giữ dữ liệu của tháng hiện tại và 1 tháng trước đó (cùng toàn bộ lịch tương lai).
 * Mọi dữ liệu có ngày trước ngày đầu tiên của tháng trước (cutoffDate) sẽ được giải phóng.
 */
export function getCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month').value, 10);
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const cutoffDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const cutoffTime = new Date(`${cutoffDate}T00:00:00+07:00`);
  const cutoffIso = cutoffTime.toISOString();
  const cutoffMs = cutoffTime.getTime();
  return {
    cutoffDate,
    cutoffIso,
    cutoffMs,
    currentMonth: `${year}-${String(month).padStart(2, '0')}`,
    previousMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
  };
}

/**
 * Giải phóng dữ liệu cũ hơn 1 tháng trước để chống đầy bộ nhớ và quá tải Cloudflare D1.
 */
export async function pruneOldData(env, now = new Date()) {
  const { cutoffDate, cutoffIso, cutoffMs, currentMonth, previousMonth } = getCutoff(now);

  // 1. Thu hồi các file backup cũ trong storage trước khi xóa log
  const oldBackups = (
    await query(env.DB, 'SELECT id, object_key FROM backup_logs WHERE created_at < ?', cutoffIso).all()
  ).results;
  const storage = backupStorage(env);
  for (const b of oldBackups) {
    if (b.object_key) {
      try {
        await storage.delete(b.object_key);
      } catch {
        // storage delete fallback ignore
      }
    }
  }

  // 2. Thống kê trước khi xóa
  const countOldShifts =
    (await query(env.DB, 'SELECT COUNT(*) as c FROM shifts WHERE date < ?', cutoffDate).first())?.c || 0;
  const countOldHistory =
    (
      await query(
        env.DB,
        "SELECT COUNT(*) as c FROM shift_history WHERE COALESCE(json_extract(payload,'$.shiftDate'), substr(json_extract(payload,'$.timestamp'),1,10)) < ?",
        cutoffDate
      ).first()
    )?.c || 0;
  const countOldAudit =
    (await query(env.DB, 'SELECT COUNT(*) as c FROM audit_logs WHERE created_at < ?', cutoffIso).first())?.c || 0;
  const countOldNotifications =
    (await query(env.DB, 'SELECT COUNT(*) as c FROM notifications WHERE created_at < ?', cutoffIso).first())?.c || 0;
  const countOldLogins =
    (await query(env.DB, 'SELECT COUNT(*) as c FROM login_history WHERE login_at < ?', cutoffMs).first())?.c || 0;

  // 3. Thực hiện xóa hàng loạt dữ liệu cũ hơn 1 tháng trước
  await env.DB.batch([
    // Phân công của ca trực cũ
    query(env.DB, 'DELETE FROM shift_assignments WHERE shift_id IN (SELECT id FROM shifts WHERE date < ?)', cutoffDate),
    // Ca trực cũ trước mốc 1 tháng trước
    query(env.DB, 'DELETE FROM shifts WHERE date < ?', cutoffDate),
    // Lịch sử đổi ca cũ
    query(
      env.DB,
      "DELETE FROM shift_history WHERE COALESCE(json_extract(payload,'$.shiftDate'), substr(json_extract(payload,'$.timestamp'),1,10)) < ?",
      cutoffDate
    ),
    // Đơn nghỉ và lịch bận cũ
    query(env.DB, 'DELETE FROM unavailable_dates WHERE date < ?', cutoffDate),
    query(env.DB, 'DELETE FROM account_leave_requests WHERE date < ?', cutoffDate),
    // Đề nghị đổi ca cũ đã kết thúc (không phải PENDING)
    query(
      env.DB,
      "DELETE FROM shift_change_requests WHERE status != 'PENDING' AND (source_date < ? OR created_at < ?)",
      cutoffDate,
      cutoffIso
    ),
    // Nợ ca đã hoàn thành bù xong từ tháng cũ
    query(
      env.DB,
      "DELETE FROM compensatory_duties WHERE json_extract(payload,'$.status') = 'COMPLETED' AND COALESCE(json_extract(payload,'$.originalShiftDate'), substr(json_extract(payload,'$.createdAt'),1,10)) < ?",
      cutoffDate
    ),
    // Thông báo cũ
    query(env.DB, 'DELETE FROM notifications WHERE created_at < ?', cutoffIso),
    // Nhật ký hoạt động audit cũ
    query(env.DB, 'DELETE FROM audit_logs WHERE created_at < ?', cutoffIso),
    // Lịch sử đăng nhập cũ (so sánh epoch ms dạng số nguyên)
    query(env.DB, 'DELETE FROM login_history WHERE login_at < ?', cutoffMs),
    // Bản sao lưu fallback D1 cũ
    query(
      env.DB,
      'DELETE FROM backup_object_chunks WHERE object_key IN (SELECT object_key FROM backup_logs WHERE created_at < ?)',
      cutoffIso
    ),
    query(env.DB, 'DELETE FROM backup_logs WHERE created_at < ?', cutoffIso),
    // Phiên và giới hạn đăng nhập hết hạn
    query(env.DB, 'DELETE FROM sessions WHERE expires_at < ?', Date.now()),
    query(env.DB, 'DELETE FROM login_limits WHERE reset_at < ?', Date.now()),
    query(env.DB, 'DELETE FROM used_google_nonces WHERE expires_at < ?', Date.now()),
  ]);

  return {
    cutoffDate,
    currentMonth,
    previousMonth,
    pruned: {
      shifts: countOldShifts,
      history: countOldHistory,
      auditLogs: countOldAudit,
      notifications: countOldNotifications,
      logins: countOldLogins,
      backups: oldBackups.length,
    },
    message: `Đã dọn dẹp và giải phóng dữ liệu cũ trước ngày ${cutoffDate} (chỉ giữ tháng ${previousMonth} và tháng ${currentMonth} trở đi).`,
  };
}
