import React, { useEffect, useState } from 'react';
import { storageEvents, StorageService } from '../services/storage';
import { call, type Profile, type SwapRequest, type SwapAudit } from '../services/api';
import type { Employee, ShiftAssignment } from '../types';
import { positions } from './LiveOverview';
import { vnDay } from '../services/schoolTime';

export function SwapView({ profile, employees, shifts }: { profile: Profile; employees: Employee[]; shifts: ShiftAssignment[] }) {
  const [requests, setRequests] = useState<SwapRequest[]>([]), [history, setHistory] = useState<SwapAudit[]>([]);
  const [date, setDate] = useState(''), [target, setTarget] = useState(''), [targetDate, setTargetDate] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      const rows = StorageService.getRequests() as unknown as SwapRequest[];
      setRequests([...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      const employees = StorageService.getEmployees();
      setHistory(
        rows
          .filter((r) => r.status === 'APPROVED')
          .map((r) => ({
            ...r,
            requestId: r.id,
            timestamp: r.respondedAt!,
            requesterName: employees.find((e) => e.id === r.requesterId)?.name || r.requesterId,
            targetName: employees.find((e) => e.id === r.targetEmployeeId)?.name || r.targetEmployeeId,
          }))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      );
    };
    load();
    storageEvents.addEventListener('data', load);
    return () => storageEvents.removeEventListener('data', load);
  }, []);

  const my = employees.find((e) => e.id === profile.employeeId);
  const mine = shifts
    .filter((s) => !s.isLocked && s.date >= vnDay() && positions.some(([key]) => s[key] === profile.employeeId))
    .sort((a, b) => a.date.localeCompare(b.date));
  const peers = employees.filter((e) => e.isActive && e.id !== my?.id && e.role === my?.role);
  const theirShifts = shifts
    .filter((s) => !s.isLocked && s.date >= vnDay() && s.date !== date && positions.some(([key]) => s[key] === target))
    .sort((a, b) => a.date.localeCompare(b.date));
  const names = new Map(employees.map((e) => [e.id, e.name]));

  const run = async (action: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      if (!navigator.onLine) throw new Error('Mất mạng. Đề nghị chưa được gửi; hãy thử lại khi có mạng.');
      await action();
      setMessage(text);
      await StorageService.refresh().catch(() =>
        setError('Thao tác đã lưu, nhưng chưa tải được lịch mới. Kiểm tra mạng rồi đồng bộ lại; không gửi lặp lại.')
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      async () => {
        await call('requestSwap', {
          shiftDate: date,
          targetEmployeeId: target,
          targetShiftDate: targetDate || null,
          reason,
        });
        setReason('');
      },
      'Đã gửi đề nghị đổi ca. Khi người nhận đồng ý, hệ thống sẽ tự động hoán đổi 2 ca và cập nhật ngay lên lịch tháng.'
    );
  };

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">Đổi ca & lịch sử</h1>
      {message && <p role="status" className="rounded-xl bg-emerald-50 text-emerald-800 p-4">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">{error}</p>}

      <form className="panel space-y-4" onSubmit={send}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Gửi đề nghị đổi ca (Tất cả các ngày)</h2>
          <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2.5 py-1 rounded-full font-semibold">
            Tự động đổi khi 2 bên đồng ý
          </span>
        </div>
        {!my ? (
          <p className="text-amber-800">
            Tài khoản chưa được liên kết với hồ sơ nhân sự. Vui lòng liên hệ Admin để được gán hồ sơ nhân sự.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Ngày bạn đang trực
                <select
                  className="field"
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTargetDate('');
                  }}
                >
                  <option value="">Chọn ngày trực của bạn</option>
                  {mine.map((s) => (
                    <option key={s.id} value={s.date}>
                      {s.date}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Người nhận cùng chức danh ({my.role === 'TEACHER' ? 'Giáo viên' : my.role === 'ADMIN' ? 'BGH' : 'Bảo vệ'})
                <select
                  className="field"
                  required
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setTargetDate('');
                  }}
                >
                  <option value="">Chọn đồng nghiệp</option>
                  {peers.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ca đối ứng của người nhận (Tất cả các ngày)
                <select className="field" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}>
                  <option value="">Nhận trực thay, ghi nhận nợ ca</option>
                  {theirShifts.map((s) => (
                    <option key={s.id} value={s.date}>
                      {s.date}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lý do đổi ca
                <input
                  className="field"
                  required
                  maxLength={1000}
                  placeholder="Nhập lý do đổi ca..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <p className="text-sm text-slate-500">
              Chỉ cần hai bên đồng ý là hai ca trực sẽ tự động hoán đổi và cập nhật ngay lập tức trên lịch tháng, không cần Admin phê duyệt thêm. Không giới hạn khoảng cách ngày trực.
            </p>
            <button className="action" disabled={busy || !mine.length}>
              Gửi đề nghị đổi ca
            </button>
          </>
        )}
      </form>

      <div className="panel space-y-3">
        <h2 className="font-bold">Đề nghị đổi ca</h2>
        {!requests.length && <p className="text-slate-500">Chưa có đề nghị đổi ca.</p>}
        {requests.map((r) => {
          const isTarget = r.targetEmployeeId === profile.employeeId;
          const isRequester = r.requesterId === profile.employeeId;
          return (
            <article key={r.id} className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p>
                  <strong>{names.get(r.requesterId) || r.requesterId}</strong> →{' '}
                  <strong>{names.get(r.targetEmployeeId) || r.targetEmployeeId}</strong>
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    r.status === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : r.status === 'REJECTED'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {r.status === 'APPROVED'
                    ? 'Đã đổi thành công'
                    : r.status === 'REJECTED'
                    ? 'Đã từ chối'
                    : isTarget
                    ? 'Chờ bạn xác nhận'
                    : 'Chờ xác nhận'}
                </span>
              </div>
              <p className="text-sm">
                Ca {r.shiftDate}
                {r.targetShiftDate ? ` ↔ ${r.targetShiftDate}` : ' • Trực thay'}
              </p>
              <p className="text-sm text-slate-500">
                {r.reason} · {new Date(r.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </p>
              {r.status === 'PENDING' && (isTarget || profile.role === 'ADMIN') && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className="action"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => call('respondSwap', { requestId: r.id, accept: true }),
                        'Đổi ca thành công. Lịch trực tháng đã được tự động cập nhật.'
                      )
                    }
                  >
                    {profile.role === 'ADMIN' && !isTarget ? 'Admin phê duyệt' : 'Đồng ý đổi ca'}
                  </button>
                  <button
                    type="button"
                    className="action secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => call('respondSwap', { requestId: r.id, accept: false }),
                        'Đã từ chối đề nghị đổi ca.'
                      )
                    }
                  >
                    Từ chối
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="panel space-y-3">
        <h2 className="font-bold">Lịch sử đổi ca đã xác nhận</h2>
        {!history.length && <p className="text-slate-500">Chưa có lần đổi ca nào.</p>}
        {history.map((h) => (
          <article key={h.id} className="border-t border-slate-200 dark:border-slate-700 pt-3 text-sm">
            <p>
              <strong>{h.requesterName}</strong> → <strong>{h.targetName}</strong> · Ca {h.shiftDate}
              {h.targetShiftDate && ` ↔ Ca ${h.targetShiftDate}`}
            </p>
            <p>{h.reason}</p>
            <time className="text-slate-500">
              {new Date(h.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
