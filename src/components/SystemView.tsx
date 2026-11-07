import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { RotateCw, Trash2, CheckCircle2 } from 'lucide-react';

type Quota = { level: number | null; percent: number } | null;
type Snapshot = {
  checkedAt: string;
  worker: string;
  d1: string;
  connections: number | null;
  size: number | null;
  r2: string;
  backup: string | null;
  backupKnown: boolean;
  usage: Partial<Record<'readQueries' | 'writeQueries' | 'rowsRead' | 'rowsWritten', number>> | null;
  errors: number | null;
  note: string | null;
  quotas: Record<'size' | 'read' | 'write', Quota>;
  events: { at: string; reason: string; count: number }[];
  backupErrors: { at: string; reason: string }[];
};

type RetentionInfo = {
  policy: string;
  cutoffDate: string;
  currentMonth: string;
  previousMonth: string;
};

type PruneResult = {
  cutoffDate: string;
  currentMonth: string;
  previousMonth: string;
  pruned: {
    shifts: number;
    history: number;
    auditLogs: number;
    notifications: number;
    logins: number;
    backups: number;
  };
  message: string;
};

const unknown = 'Chưa có số liệu',
  number = (n?: number | null) => (n == null ? unknown : n.toLocaleString('vi-VN')),
  date = (s: string) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export function SystemView() {
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [retention, setRetention] = useState<RetentionInfo | null>(null);
  const [error, setError] = useState('');
  const [isPruning, setIsPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<PruneResult | null>(null);

  useEffect(() => {
    let active = true;
    setSnapshot(null);
    setError('');
    api<Snapshot>('/system')
      .then((v) => {
        if (active) setSnapshot(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });

    api<RetentionInfo>('/system/retention')
      .then((r) => {
        if (active) setRetention(r);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [refresh]);

  const handlePrune = async () => {
    if (!window.confirm('Hệ thống sẽ giải phóng toàn bộ dữ liệu lịch sử cũ trước tháng trước để tiết kiệm dung lượng D1. Bạn có chắc chắn muốn thực hiện?')) {
      return;
    }
    setIsPruning(true);
    setPruneResult(null);
    try {
      const res = await api<PruneResult>('/system/prune', 'POST');
      setPruneResult(res);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError('Lỗi giải phóng dung lượng: ' + (e as Error).message);
    } finally {
      setIsPruning(false);
    }
  };

  const s = snapshot;
  const busy = !s && !error;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Giám sát hệ thống</h1>
        <button className="action" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
          Kiểm tra lại
        </button>
      </div>

      {busy && <p role="status">Đang kiểm tra…</p>}
      {error && (
        <p className="panel" role="alert">
          Không kiểm tra được hệ thống: {error}
        </p>
      )}

      {/* Chính sách lưu trữ & giải phóng dung lượng chống quá tải */}
      <div className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              <span>Chính sách lưu trữ & Giải phóng dung lượng D1</span>
              <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                Giữ 1 tháng trước & tháng này
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Hệ thống chỉ lưu dữ liệu từ <strong>1 tháng trước ({retention?.previousMonth || 'tháng trước'})</strong> và{' '}
              <strong>tháng này ({retention?.currentMonth || 'tháng này'})</strong> trở đi (mốc từ ngày{' '}
              {retention?.cutoffDate || '...'}). Mọi dữ liệu cũ hơn được giải phóng để chống đầy dung lượng 500 MB và
              tránh quá tải gói miễn phí Cloudflare.
            </p>
          </div>
          <button
            type="button"
            className="action"
            disabled={isPruning}
            onClick={handlePrune}
          >
            {isPruning ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang giải phóng...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dọn dẹp & giải phóng dung lượng ngay</span>
              </>
            )}
          </button>
        </div>

        {pruneResult && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>{pruneResult.message}</span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
              Đã xóa: {pruneResult.pruned.shifts} ca trực cũ, {pruneResult.pruned.history} bản ghi đổi ca,{' '}
              {pruneResult.pruned.notifications} thông báo cũ, {pruneResult.pruned.auditLogs} nhật ký audit,{' '}
              {pruneResult.pruned.logins} lịch sử đăng nhập, {pruneResult.pruned.backups} bản sao lưu cũ.
            </div>
          </div>
        )}
      </div>

      {s && (
        <>
          <p className="text-xs text-slate-500">
            Kiểm tra lúc {date(s.checkedAt)}. Số liệu Analytics có thể đến chậm.
          </p>
          <dl className="panel grid gap-4 sm:grid-cols-2">
            {Object.entries({
              Worker: s.worker,
              'Kết nối D1': s.d1,
              'WebSocket đang mở': number(s.connections),
              'Dung lượng D1': s.size == null ? unknown : `${(s.size / 1048576).toFixed(2)} MiB`,
              'Sao lưu thành công gần nhất': s.backup
                ? date(s.backup)
                : s.backupKnown
                ? 'Chưa có bản thành công'
                : unknown,
              'Kho R2': s.r2,
              'Lượt truy vấn đọc hôm nay (UTC)': number(s.usage?.readQueries),
              'Lượt truy vấn ghi hôm nay (UTC)': number(s.usage?.writeQueries),
              'Dòng đọc / ghi toàn tài khoản hôm nay (UTC)': `${number(s.usage?.rowsRead)} / ${number(
                s.usage?.rowsWritten
              )}`,
              'Lỗi thực thi Worker trong 24 giờ': number(s.errors),
            }).map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-slate-600 dark:text-slate-400">{k}</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="panel space-y-2">
            <h2 className="font-bold">Hạn mức gói miễn phí</h2>
            {Object.entries(s.quotas).map(([k, v]) => (
              <p key={k} className="text-sm">
                {(
                  {
                    size: 'Dung lượng database',
                    read: 'Dòng đọc toàn tài khoản',
                    write: 'Dòng ghi toàn tài khoản',
                  } as Record<string, string>
                )[k]}
                : {v ? `${v.percent.toFixed(1)}%` : unknown}
                {v?.level && <strong className="text-amber-800"> · Cảnh báo ngưỡng {v.level}%</strong>}
              </p>
            ))}
            {s.note && <p className="text-xs text-slate-500">{s.note}</p>}
          </div>

          <div className="panel space-y-2">
            <h2 className="font-bold">Lỗi gần đây</h2>
            {s.events.map((e, i) => (
              <p key={'w' + i} className="text-xs text-slate-600 dark:text-slate-400">
                {date(e.at)} · Worker: {e.reason} ({number(e.count)})
              </p>
            ))}
            {s.backupErrors.map((e, i) => (
              <p key={'b' + i} className="text-xs text-slate-600 dark:text-slate-400">
                {date(e.at)} · Sao lưu: {e.reason}
              </p>
            ))}
            {!s.events.length && !s.backupErrors.length && (
              <p className="text-xs text-slate-500">Không có bản ghi lỗi để hiển thị từ các nguồn đã đọc.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
