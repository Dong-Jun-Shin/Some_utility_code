import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

export function formatToTime(seconds: number): string {
  const duration = dayjs.duration(seconds, "seconds");

  return `${duration.years() !== 0 ? duration.years() + "년" : ""} 
  ${duration.months() !== 0 ? duration.months() + "개월" : ""} 
  ${duration.days() !== 0 ? duration.days() + "일" : ""} 
  ${duration.hours() !== 0 ? duration.hours() + "시간" : ""} 
  ${duration.minutes() !== 0 ? duration.minutes() + "분" : ""} 
  ${duration.seconds() !== 0 ? duration.seconds() + "초" : ""} `;
}
