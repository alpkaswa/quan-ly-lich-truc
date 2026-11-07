import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite;
let Sidebar;
let Header;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const sidebarMod = await vite.ssrLoadModule('./src/components/Sidebar.tsx');
  Sidebar = sidebarMod.Sidebar;
  const headerMod = await vite.ssrLoadModule('./src/components/Header.tsx');
  Header = headerMod.Header;
});

after(async () => {
  await vite?.close();
});

test('Admin Sidebar: All 8 Everyday + 9 Management tabs + Settings button render in navigation', () => {
  let selectedTab = '';
  let settingsOpened = false;

  const html = renderToStaticMarkup(
    createElement(Sidebar, {
      currentTab: 'dashboard',
      onSelectTab: (t) => { selectedTab = t; },
      currentUserRole: 'ADMIN',
      pendingLeavesCount: 3,
      pendingCompensatoryCount: 1,
      pendingSwapsCount: 2,
      conflictsCount: 0,
      schoolName: 'Trường PTDT Nội Trú Na Rì',
      onOpenSettings: () => { settingsOpened = true; },
    })
  );

  // Check Everyday nav
  assert.ok(html.includes('Hôm nay &amp; Ngày mai'), 'Dashboard present');
  assert.ok(html.includes('Ca trực của tôi'), 'My duties present');
  assert.ok(html.includes('Lịch tháng'), 'Schedule present');
  assert.ok(html.includes('Tìm ca trực'), 'Lookup present');
  assert.ok(html.includes('Đổi ca &amp; Lịch sử'), 'Swaps present');
  assert.ok(html.includes('Lịch bận &amp; Nghỉ phép'), 'Leaves present');
  assert.ok(html.includes('Thống kê'), 'Statistics present');
  assert.ok(html.includes('In &amp; Xuất lịch'), 'Export present');

  // Check Management nav
  assert.ok(html.includes('Quản lý'), 'Management group present');
  assert.ok(html.includes('Xếp lịch tự động'), 'Auto schedule present');
  assert.ok(html.includes('Nhân sự'), 'Employees present');
  assert.ok(html.includes('Trực bù &amp; Nợ ca'), 'Compensatory present');
  assert.ok(html.includes('Tài khoản nhân sự'), 'Accounts present');
  assert.ok(html.includes('Nhật ký hoạt động'), 'Activity audit present');
  assert.ok(html.includes('Giám sát hệ thống'), 'System monitor present');
  assert.ok(html.includes('Sao lưu &amp; Khôi phục'), 'Backups present');
  assert.ok(html.includes('Tổng quan quản lý'), 'Overview present');
  assert.ok(html.includes('Kiểm tra xếp lịch'), 'Tests present');
  assert.ok(html.includes('Cài đặt'), 'Settings button present');

  // Check badges
  assert.ok(html.includes('>3<'), 'Pending leaves badge');
  assert.ok(html.includes('>2<'), 'Pending swaps badge');
  assert.ok(html.includes('>1<'), 'Pending compensatory badge');
});

test('Staff / Nhân viên Sidebar: Management section is completely hidden', () => {
  const html = renderToStaticMarkup(
    createElement(Sidebar, {
      currentTab: 'dashboard',
      onSelectTab: () => {},
      currentUserRole: 'TEACHER',
      pendingLeavesCount: 0,
      pendingCompensatoryCount: 0,
      pendingSwapsCount: 0,
      conflictsCount: 0,
      schoolName: 'Trường PTDT Nội Trú Na Rì',
      onOpenSettings: () => {},
    })
  );

  // Must have everyday tabs
  assert.ok(html.includes('Hôm nay &amp; Ngày mai'), 'Dashboard present for staff');
  assert.ok(html.includes('Ca trực của tôi'), 'My duties present for staff');
  assert.ok(html.includes('Lịch tháng'), 'Schedule present for staff');
  assert.ok(html.includes('Tìm ca trực'), 'Lookup present for staff');
  assert.ok(html.includes('Đổi ca &amp; Lịch sử'), 'Swaps present for staff');
  assert.ok(html.includes('Lịch bận &amp; Nghỉ phép'), 'Leaves present for staff');
  assert.ok(html.includes('Thống kê'), 'Statistics present for staff');
  assert.ok(html.includes('In &amp; Xuất lịch'), 'Export present for staff');

  // Must NOT have management tabs
  assert.ok(!html.includes('management-nav'), 'No management-nav container');
  assert.ok(!html.includes('Xếp lịch tự động'), 'No Auto schedule');
  assert.ok(!html.includes('Nhân sự</span>'), 'No Employees management');
  assert.ok(!html.includes('Trực bù &amp; Nợ ca'), 'No Compensatory management');
  assert.ok(!html.includes('Tài khoản nhân sự'), 'No Accounts management');
  assert.ok(!html.includes('Nhật ký hoạt động'), 'No Activity audit');
  assert.ok(!html.includes('Giám sát hệ thống'), 'No System monitor');
  assert.ok(!html.includes('Sao lưu &amp; Khôi phục'), 'No Backups');
  assert.ok(!html.includes('Tổng quan quản lý'), 'No Overview');
  assert.ok(!html.includes('Kiểm tra xếp lịch'), 'No Tests');
  assert.ok(!html.includes('Cài đặt'), 'No Settings button');
});

test('Header Navigation: Displays accurate role & Vietnamese tab titles for Admin', () => {
  const tabs = [
    { id: 'dashboard', title: 'Hôm nay & Ngày mai' },
    { id: 'my-duties', title: 'Ca trực của tôi' },
    { id: 'schedule', title: 'Lịch tháng' },
    { id: 'lookup', title: 'Tìm tên & Ca trực' },
    { id: 'swaps', title: 'Đổi ca & Lịch sử' },
    { id: 'leaves', title: 'Lịch bận & Nghỉ phép' },
    { id: 'statistics', title: 'Thống kê' },
    { id: 'export', title: 'In & Xuất lịch' },
    { id: 'auto-schedule', title: 'Xếp lịch tự động' },
    { id: 'employees', title: 'Nhân sự' },
    { id: 'compensatory', title: 'Trực bù & Nợ ca' },
    { id: 'accounts', title: 'Quản lý tài khoản' },
    { id: 'activity', title: 'Nhật ký hoạt động' },
    { id: 'system', title: 'Giám sát hệ thống' },
    { id: 'backups', title: 'Sao lưu & Khôi phục' },
    { id: 'overview', title: 'Tổng quan quản lý' },
    { id: 'tests', title: 'Kiểm tra xếp lịch' },
  ];

  for (const { id, title } of tabs) {
    const html = renderToStaticMarkup(
      createElement(Header, {
        currentTab: id,
        currentUserRole: 'ADMIN',
        isDarkMode: false,
        onToggleDarkMode: () => {},
        pendingLeavesCount: 0,
        authUser: {
          id: 'admin-1',
          name: 'Thầy Hiệu Trưởng',
          email: 'admin@truong.edu.vn',
          role: 'ADMIN',
          loginAt: new Date().toISOString(),
        },
        onLogout: () => {},
      })
    );

    const expectedTitle = title.replace(/&/g, '&amp;');
    assert.ok(html.includes(expectedTitle), `Header title "${title}" for tab ${id}`);
    assert.ok(html.includes('Quản trị viên'), 'Role label "Quản trị viên" displayed');
    assert.ok(html.includes('Thầy Hiệu Trưởng'), 'User name displayed');
  }
});

test('Header Navigation: Displays accurate role & title for Staff', () => {
  const html = renderToStaticMarkup(
    createElement(Header, {
      currentTab: 'schedule',
      currentUserRole: 'TEACHER',
      isDarkMode: false,
      onToggleDarkMode: () => {},
      pendingLeavesCount: 2,
      authUser: {
        id: 'gv-1',
        name: 'Cô Giáo Viên',
        email: 'gv@truong.edu.vn',
        role: 'TEACHER',
        loginAt: new Date().toISOString(),
      },
      onLogout: () => {},
    })
  );

  assert.ok(html.includes('Lịch tháng'), 'Header title "Lịch tháng"');
  assert.ok(html.includes('Nhân viên'), 'Role label "Nhân viên" displayed');
  assert.ok(html.includes('Cô Giáo Viên'), 'User name displayed');
  assert.ok(html.includes('2'), 'Pending leaves counter badge');
});

test('Navigation State: Active tab styling is-active and aria-current=page apply correctly to selected tab', () => {
  const allTabs = [
    'dashboard', 'my-duties', 'schedule', 'lookup', 'swaps', 'leaves', 'statistics', 'export',
    'auto-schedule', 'employees', 'compensatory', 'accounts', 'activity', 'system', 'backups', 'overview', 'tests'
  ];

  for (const tab of allTabs) {
    const html = renderToStaticMarkup(
      createElement(Sidebar, {
        currentTab: tab,
        onSelectTab: () => {},
        currentUserRole: 'ADMIN',
        pendingLeavesCount: 0,
        pendingCompensatoryCount: 0,
        pendingSwapsCount: 0,
        conflictsCount: 0,
        schoolName: 'Trường PTDT Nội Trú Na Rì',
        onOpenSettings: () => {},
      })
    );

    // Matches the active button with data-nav-id="{tab}" and is-active
    assert.match(
      html,
      new RegExp(`data-nav-id="${tab}"[^>]*aria-current="page"[^>]*class="nav-item is-active"`),
      `Tab ${tab} should have is-active and aria-current="page"`
    );
  }
});

test('Mobile navigation trigger: Displays current active tab name', () => {
  const html = renderToStaticMarkup(
    createElement(Sidebar, {
      currentTab: 'swaps',
      onSelectTab: () => {},
      currentUserRole: 'ADMIN',
      pendingLeavesCount: 0,
      conflictsCount: 0,
      schoolName: 'Trường PTDT Nội Trú Na Rì',
      onOpenSettings: () => {},
    })
  );

  assert.ok(html.includes('mobile-nav-trigger'), 'Mobile trigger button rendered');
  assert.ok(html.includes('<span>Đổi ca &amp; Lịch sử</span>'), 'Mobile trigger shows active tab label');
});

