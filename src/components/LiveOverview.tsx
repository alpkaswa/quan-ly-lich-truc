import React from 'react';
import type { Employee, ShiftAssignment } from '../types';
import { useRealTimeClock } from '../hooks/useRealTimeClock';
import { vnDay, dayOffset, activeDutyDate } from '../services/schoolTime';
export const positions = [['teacher1Id', 'Giáo viên 1'], ['teacher2Id', 'Giáo viên 2'], ['adminId', 'Ban giám hiệu'], ['guardId', 'Bảo vệ']] as const;
export function LiveOverview({ employees, shifts, onSwap }: { employees: Employee[]; shifts: ShiftAssignment[]; onSwap: () => void }) {
  const { now } = useRealTimeClock();
  const today = vnDay(now), tomorrow = dayOffset(today, 1), duty = activeDutyDate(now);
  const names = new Map(employees.map(e => [e.id, e.name]));
  const dates = [...new Set([duty, today, tomorrow])];
  return <section className="space-y-5">
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5">
      <p className="text-slate-500 text-sm">LỊCH TRỰC CHUNG</p><h1 className="text-2xl font-bold mt-2">Hôm nay ai trực?</h1>
      <p className="mt-2 text-slate-500">Ca trực 07:00 đến 07:00 ngày hôm sau • Giờ Việt Nam</p>
      <button className="action mt-4" onClick={onSwap}>Đề nghị đổi ca / xem lịch sử</button>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {dates.map(date => {
        const shift = shifts.find(s => s.date === date);
        return <article key={date} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex justify-between gap-2 items-start"><div><h2 className="text-lg font-bold">{date === today ? 'Hôm nay' : date === tomorrow ? 'Ngày mai' : 'Ca từ hôm qua'}</h2><p className="text-sm text-slate-500">{date.split('-').reverse().join('/')}</p></div>{date === duty && <span className="rounded-full bg-emerald-100 text-emerald-800 text-xs px-3 py-1">Đang trực</span>}</div>
          <div className="mt-4 space-y-3">{positions.map(([key, label]) => <div key={key} className="flex justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3"><span className="text-sm text-slate-500">{label}</span><strong className={shift?.[key] ? 'text-right' : 'text-amber-700'}>{names.get(shift?.[key] || '') || 'Chưa phân công'}</strong></div>)}</div>
          {!shift && <p className="text-sm text-amber-700 mt-4">Chưa có lịch cho ngày này. Admin cần nhập hoặc xếp lịch.</p>}
        </article>;
      })}
    </div>
    <p className="text-sm text-slate-500">Mở mục Lịch tháng để tìm theo tên, số điện thoại hoặc ngày trực.</p>
  </section>;
}
