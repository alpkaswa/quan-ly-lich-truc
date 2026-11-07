import {AccountAudit} from './AccountAudit';
import React, { useEffect, useState } from 'react';
import { storageEvents } from '../services/storage';
import { api, call, type Profile } from '../services/api';
import type { Employee } from '../types';

export function AccountsView({ employees }: { employees: Employee[] }) {
  const [username, setUsername] = useState(''), [employeeId, setEmployeeId] = useState(''), [initialPassword, setInitialPassword] = useState('1');
  const [history, setHistory] = useState<any[]>([]), [historyUser, setHistoryUser] = useState(''), [date, setDate] = useState(''), [month, setMonth] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('ALL'), [role, setRole] = useState('ALL'), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [showAccountListModal, setShowAccountListModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    void api<Profile[]>('/accounts')
      .then(setProfiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    storageEvents.addEventListener('data', load);
    return () => storageEvents.removeEventListener('data', load);
  }, []);

  const run = async (action: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      load();
      setNotice(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeAdmins = profiles.filter((p) => p.role === 'ADMIN' && p.active).length;
  const changeRole = (p: Profile) => {
    const next = p.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (
      window.confirm(
        `${next === 'ADMIN' ? 'Cấp quyền quản trị đầy đủ cho' : 'Thu hồi quyền quản trị của'} ${p.displayName}? Tài khoản phải đăng nhập lại để nhận quyền mới.`
      )
    )
      void run(
        () => api('/accounts/role', 'POST', { uid: p.id, role: next, expectedRole: p.role === 'ADMIN' ? 'ADMIN' : 'USER', confirm: true }),
        'Đã đổi quyền và thu hồi các phiên cũ.'
      );
  };

  const names = new Map(employees.map((e) => [e.id, e]));
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();

  const visible = profiles.filter((p) => {
    const e = names.get(p.employeeId || '');
    return (
      (role === 'ALL' || p.role === role) &&
      (status === 'ALL' || (status === 'ACTIVE' ? p.active : !p.active)) &&
      normalize([p.displayName, p.email, p.username, e?.name, e?.code].filter(Boolean).join(' ')).includes(normalize(search.trim()))
    );
  });

  const unprovisionedEmployees = employees.filter((e) => e.isActive && !profiles.some((p) => p.employeeId === e.id));

  // Tự động cấp tài khoản hàng loạt cho tất cả nhân sự chưa có tài khoản
  const handleBatchCreate = () => {
    if (unprovisionedEmployees.length === 0) {
      setNotice('Tất cả nhân sự đang hoạt động đều đã có tài khoản.');
      return;
    }
    if (
      window.confirm(
        `Bạn có chắc muốn tự động cấp tài khoản cho ${unprovisionedEmployees.length} nhân sự chưa có tài khoản? Tên đăng nhập sẽ lấy theo mã nhân sự và mật khẩu ban đầu là 1.`
      )
    ) {
      void run(
        async () => {
          const res = await api<{ count: number; created?: any[] }>('/accounts/batch', 'POST', { password: '1' });
          setNotice(`Đã tự động tạo thành công ${res.count} tài khoản nhân sự với mật khẩu ban đầu là 1.`);
        },
        `Đã tạo tài khoản cho ${unprovisionedEmployees.length} nhân sự.`
      );
    }
  };

  // Sao chép danh sách tài khoản để Admin gửi cho giáo viên
  const handleCopyAccountList = () => {
    const rows = profiles.map((p) => {
      const e = names.get(p.employeeId || '');
      return `${e?.name || p.displayName}\t${e?.code || '—'}\t${p.username}\t1\t${p.role === 'ADMIN' ? 'Quản trị' : 'Nhân viên'}\t${p.active ? 'Hoạt động' : 'Đã khóa'}`;
    });
    const header = 'Họ và tên\tMã nhân sự\tTên đăng nhập\tMật khẩu ban đầu\tVai trò\tTrạng thái\n';
    navigator.clipboard.writeText(header + rows.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý tài khoản</h1>
          <p className="text-xs text-slate-500 mt-1">Lập tài khoản, phân quyền và cấp mật khẩu cho nhân sự nhà trường</p>
        </div>
        <div className="flex gap-2">
          {unprovisionedEmployees.length > 0 && (
            <button
              type="button"
              className="action text-xs"
              disabled={busy}
              onClick={handleBatchCreate}
              title="Tự động tạo tài khoản theo mã nhân sự với mật khẩu là 1 cho tất cả giáo viên chưa có tài khoản"
            >
              ⚡ Cấp tài khoản tự động ({unprovisionedEmployees.length} người)
            </button>
          )}
          <button
            type="button"
            className="action secondary text-xs"
            onClick={() => setShowAccountListModal(true)}
          >
            📋 Xem & Xuất danh sách tài khoản
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 text-sm">{error}</p>}
      {notice && <p role="status" className="text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-sm">{notice}</p>}

      {/* Form Cấp tài khoản nhân sự */}
      <form
        className="panel space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api('/accounts', 'POST', { username, employeeId, password: initialPassword || '1' }),
            `Đã tạo tài khoản cho nhân sự. Tên đăng nhập: ${username}, Mật khẩu ban đầu: ${initialPassword || '1'}.`
          );
          setUsername('');
          setEmployeeId('');
          setInitialPassword('1');
        }}
      >
        <h2 className="font-bold text-base">Cấp tài khoản nhân sự</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold">
            Nhân sự
            <select
              className="field mt-1 w-full"
              required
              value={employeeId}
              onChange={(e) => {
                const empId = e.target.value;
                setEmployeeId(empId);
                const emp = employees.find((x) => x.id === empId);
                if (emp && emp.code) {
                  setUsername(emp.code.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                }
              }}
            >
              <option value="">Chọn nhân sự chưa có tài khoản</option>
              {unprovisionedEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.code}) - {e.department}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold">
            Tên đăng nhập
            <input
              className="field mt-1 w-full"
              required
              minLength={3}
              maxLength={64}
              pattern="[a-zA-Z0-9._-]+"
              placeholder="VD: gv10, gv13, bv01..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold">
            Mật khẩu ban đầu
            <input
              className="field mt-1 w-full"
              required
              minLength={1}
              maxLength={128}
              placeholder="Mặc định là 1"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
            />
          </label>
        </div>

        <p className="text-xs text-slate-500">
          Mật khẩu ban đầu là 1. Nhân viên có thể đổi sau khi đăng nhập.
        </p>

        <div className="flex gap-2">
          <button className="action text-xs" disabled={busy || !employeeId || !username}>
            Tạo tài khoản
          </button>
        </div>
      </form>

      {/* Modal Xuất danh sách tài khoản */}
      {showAccountListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                  Danh Sách Tài Khoản Nhân Sự ({profiles.length} tài khoản)
                </h3>
                <p className="text-xs text-slate-500">Thông tin đăng nhập cấp cho giáo viên, quản sinh và nhân viên</p>
              </div>
              <button
                onClick={() => setShowAccountListModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3">Mã nhân sự</th>
                    <th className="py-2.5 px-3">Tên đăng nhập</th>
                    <th className="py-2.5 px-3">Mật khẩu ban đầu</th>
                    <th className="py-2.5 px-3">Vai trò</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {profiles.map((p) => {
                    const e = names.get(p.employeeId || '');
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200">
                          {e?.name || p.displayName}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{e?.code || '—'}</td>
                        <td className="py-2 px-3 font-bold text-indigo-600 dark:text-indigo-400">{p.username}</td>
                        <td className="py-2 px-3 text-amber-600 dark:text-amber-400 font-bold">1</td>
                        <td className="py-2 px-3 font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                            {p.role === 'ADMIN' ? 'Quản trị' : 'Nhân viên'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {p.active ? 'Hoạt động' : 'Đã khóa'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
              <span className="text-xs text-slate-500">Giáo viên có thể dùng Tên đăng nhập hoặc Mã nhân sự để đăng nhập.</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="action text-xs"
                  onClick={handleCopyAccountList}
                >
                  {copied ? '✓ Đã sao chép vào bộ nhớ tạm' : 'Sao chép toàn bộ danh sách'}
                </button>
                <button
                  type="button"
                  className="action secondary text-xs"
                  onClick={() => setShowAccountListModal(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Danh sách tài khoản người dùng */}
      <div className="panel space-y-4">
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <div>
            <h2 className="font-bold text-lg">Danh sách tài khoản người dùng</h2>
            <p className="text-sm text-slate-500">
              {profiles.length} tài khoản · {profiles.filter((p) => p.active).length} đang hoạt động · {profiles.filter((p) => !p.employeeId).length} chưa gắn hồ sơ
            </p>
          </div>
          <button className="action secondary text-xs" disabled={loading} onClick={load}>
            {loading ? 'Đang tải…' : 'Làm mới danh sách'}
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Chỉ tài khoản được Admin cấp hoặc email có trong hồ sơ nhân sự mới được đăng nhập lần đầu. Chỉ Admin được xem toàn bộ danh sách này.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold">
            Tìm người dùng
            <input
              className="field mt-1 w-full"
              placeholder="Tên, mã nhân sự hoặc tên đăng nhập"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold">
            Quyền
            <select className="field mt-1 w-full" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="ALL">Tất cả quyền</option>
              <option value="ADMIN">ADMIN — Quản trị viên</option>
              <option value="EMPLOYEE">USER — Nhân viên</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Trạng thái
            <select className="field mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="LOCKED">Đã khóa</option>
            </select>
          </label>
        </div>

        {!loading && !visible.length && <p className="py-4 text-slate-500 text-sm">Không có tài khoản phù hợp.</p>}

        <div className="space-y-3">
          {visible.map((p) => {
            const employee = names.get(p.employeeId || '');
            return (
              <article key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex flex-wrap gap-3 justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold break-words flex items-center gap-2">
                      <span>{p.displayName}</span>
                      {employee?.code && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {employee.code}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 break-all font-mono">
                      Tên đăng nhập: <strong>{p.username}</strong> · {p.email || 'Chưa liên kết Google'}
                    </p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-1 text-xs">
                      Vai trò: {p.role === 'ADMIN' ? 'ADMIN' : 'USER'}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-xs ${p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {p.active ? 'Đang hoạt động' : 'Đã khóa'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-between items-center gap-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <strong>Hồ sơ nhân sự:</strong> {employee ? `${employee.name} (${employee.code}) - ${employee.department}` : 'Chưa gắn hồ sơ nhân sự'}
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <label className="text-xs">
                      Gắn hồ sơ:
                      <select
                        className="field ml-1"
                        disabled={busy}
                        value={p.employeeId || ''}
                        onChange={(e) => {
                          const empId = e.target.value;
                          if (empId && window.confirm('Đổi liên kết hồ sơ và yêu cầu tài khoản đăng nhập lại?'))
                            void run(() => api('/accounts/link', 'POST', { uid: p.id, employeeId: empId }), 'Đã liên kết hồ sơ.');
                        }}
                      >
                        <option value="">Chọn nhân sự</option>
                        {employees
                          .filter((e) => e.isActive && !profiles.some((other) => other.id !== p.id && other.employeeId === e.id))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} ({e.code})
                            </option>
                          ))}
                      </select>
                    </label>

                    {p.role !== 'ADMIN' && (
                      <button
                        className="action secondary text-xs"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Cấp lại mật khẩu về 1 và đăng xuất các phiên của tài khoản này?'))
                            void run(() => api('/accounts/reset-password', 'POST', { uid: p.id, newPassword: '1' }), 'Đã cấp lại mật khẩu về 1.');
                        }}
                      >
                        Cấp lại mật khẩu
                      </button>
                    )}

                    <button
                      className="action secondary text-xs"
                      disabled={busy || (p.role === 'ADMIN' && p.active && activeAdmins <= 1)}
                      onClick={() => {
                        if (
                          window.confirm(
                            `${p.active ? 'Khóa' : 'Mở khóa'} tài khoản ${p.displayName}? ${p.active ? 'Các phiên đang mở sẽ bị thu hồi.' : ''}`
                          )
                        )
                          void run(() => call('setAccountActive', { uid: p.id, active: !p.active, confirm: true }), 'Đã cập nhật trạng thái tài khoản.');
                      }}
                    >
                      {p.active ? 'Khóa tài khoản' : 'Mở khóa'}
                    </button>

                    <button
                      className="action secondary text-xs"
                      disabled={busy || (p.role === 'ADMIN' ? p.active && activeAdmins <= 1 : !p.active || !p.employeeId)}
                      onClick={() => changeRole(p)}
                    >
                      {p.role === 'ADMIN' ? 'Thu hồi quyền Admin' : 'Cấp quyền Admin'}
                    </button>

                    <button
                      className="action secondary text-xs !text-rose-600 hover:!bg-rose-50 dark:hover:!bg-rose-950/40 !border-rose-200 dark:!border-rose-800"
                      disabled={busy || (p.role === 'ADMIN' && activeAdmins <= 1)}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${p.displayName}" (${p.username})?\n\nSau khi xóa, tài khoản sẽ bị hủy hoàn toàn và nhân sự có thể được cấp tài khoản mới nếu cần.`
                          )
                        ) {
                          void run(() => api('/accounts/delete', 'POST', { uid: p.id }), `Đã xóa tài khoản ${p.displayName}.`);
                        }
                      }}
                      title="Xóa vĩnh viễn tài khoản này khỏi hệ thống"
                    >
                      Xóa tài khoản
                    </button>
                  </div>
                </div>

                {p.role === 'ADMIN' && p.active && activeAdmins <= 1 && (
                  <p className="text-xs text-amber-700 mt-2">
                    Admin hoạt động cuối cùng — cần Admin khác thay thế trước khi khóa hoặc thu hồi.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <AccountAudit profiles={profiles} />

      {/* Lịch sử đăng nhập */}
      <section className="panel space-y-3">
        <h2 className="font-bold">Lịch sử đăng nhập</h2>
        <p className="text-sm">
          Thời gian phiên không phải thời gian làm việc. Đóng trình duyệt/mất mạng chỉ có hoạt động cuối; phiên kết thúc khi hết hạn hoặc bị thu hồi.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold">
            Người dùng
            <select className="field mt-1" value={historyUser} onChange={(e) => setHistoryUser(e.target.value)}>
              <option value="">Tất cả</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Ngày
            <input className="field mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">
            Tháng
            <input className="field mt-1" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button
              className="action text-xs"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setHistory(await api('/accounts/history?' + new URLSearchParams({ user: historyUser, date, month })));
                }, 'Đã tải tối đa 200 phiên gần nhất theo bộ lọc.')
              }
            >
              Xem lịch sử
            </button>
          </div>
        </div>
        {history.map((h) => (
          <article key={h.id} className="border-t pt-2 text-sm">
            <strong>{h.display_name || h.user_id}</strong>
            <p className="text-xs text-slate-600">
              Đăng nhập: {new Date(h.login_at).toLocaleString('vi-VN')} · Hoạt động cuối: {new Date(h.last_activity_at).toLocaleString('vi-VN')}
            </p>
            <p className="text-xs text-slate-500">
              Kết thúc: {h.logout_at ? new Date(h.logout_at).toLocaleString('vi-VN') : 'Chưa ghi nhận'} · {h.logout_reason || 'Phiên chưa kết thúc'} · {h.duration_seconds ?? '—'} giây
            </p>
            <p className="break-all text-xs text-slate-400 font-mono mt-0.5">{h.device}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
