import React from 'react';
import { UserCheck, Moon, Sun, Clock, Bell, LogIn, LogOut, ShieldCheck, User } from 'lucide-react';
import { AppUserRole, AuthUser } from '../types';
import { useRealTimeClock } from '../hooks/useRealTimeClock';

interface HeaderProps {
  currentTab: string;
  currentUserRole: AppUserRole;

  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenGmailNotice?: () => void;
  pendingLeavesCount: number;
  authUser: AuthUser | null;

  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  currentUserRole,

  isDarkMode,
  onToggleDarkMode,
  pendingLeavesCount,
  authUser,

  onLogout,
}) => {
  const { formattedTime, formattedDateFull, handoverStatus } = useRealTimeClock();

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'my-duties': return 'Ca trực của tôi';
      case 'lookup': return 'Tìm tên & Ca trực';
      case 'swaps': return 'Đổi ca & Lịch sử';
      case 'accounts': return 'Quản lý tài khoản';
      case 'activity': return 'Nhật ký hoạt động';
      case 'system': return 'Giám sát hệ thống';
      case 'backups': return 'Sao lưu & Khôi phục';
      case 'overview': return 'Tổng quan quản lý';
      case 'dashboard':
        return 'Hôm nay & Ngày mai';
      case 'schedule':
        return 'Lịch tháng';
      case 'auto-schedule':
        return 'Xếp lịch tự động';
      case 'employees':
        return 'Nhân sự';
      case 'leaves':
        return 'Lịch bận & Nghỉ phép';
      case 'compensatory':
        return 'Trực bù & Nợ ca';
      case 'statistics':
        return 'Thống kê';
      case 'export':
        return 'In & Xuất lịch';
      case 'tests':
        return 'Kiểm tra xếp lịch';
      default:
        return 'Hệ Thống Quản Lý Lịch Trực';
    }
  };

  return (
    <header className="min-h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0 no-print transition-colors">
      {/* Breadcrumb & Section Name */}
      <div className="flex items-center gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
          Quản lý nội trú <span className="mx-1">/</span>
        </div>
        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base tracking-tight truncate max-w-[180px] sm:max-w-xs md:max-w-none">
          {getTabTitle(currentTab)}
        </h2>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time Clock Banner */}
        <div
          title="Giờ Việt Nam trên thiết bị"
          className={`hidden md:flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums border transition-colors ${
            handoverStatus.isHandoverWindow
              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 animate-pulse'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/60'
          }`}
        >
          <Clock className={`w-3.5 h-3.5 shrink-0 ${handoverStatus.isHandoverWindow ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
          <span className="hidden xl:inline text-slate-500 dark:text-slate-400">
            {formattedDateFull} <span className="mx-0.5">·</span>
          </span>
          <span className="font-mono font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {formattedTime}
          </span>
          {handoverStatus.isHandoverWindow && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
              Giao ban 07:00
            </span>
          )}
        </div>

        {/* Pending Leaves notification trigger */}
        {pendingLeavesCount > 0 && (
          <div
            title={`${pendingLeavesCount} đơn xin nghỉ/bận đang chờ duyệt`}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900/60"
          >
            <Bell className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="tabular-nums font-mono">{pendingLeavesCount}</span>
            <span className="hidden lg:inline text-[11px]">đơn chờ duyệt</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <div className="hidden sm:block text-right"><strong className="block">{authUser?.name}</strong><span>{currentUserRole === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</span></div>
          <button onClick={onLogout} className="p-2 rounded-lg hover:bg-slate-100" title="Đăng xuất" aria-label="Đăng xuất"><LogOut className="w-4 h-4" /></button>
        </div>
        {/* Dark mode toggle */}
        <button
          onClick={onToggleDarkMode}
          title={isDarkMode ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};

