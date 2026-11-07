export function vnDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function dayOffset(day: string, offset: number) {
  const value = new Date(`${day}T12:00:00+07:00`);
  value.setUTCDate(value.getUTCDate() + offset);
  return vnDay(value);
}
export function activeDutyDate(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return dayOffset(vnDay(now), hour < 7 ? -1 : 0);
}
