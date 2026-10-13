package cn.rizimianmian.backend.events;

import org.springframework.stereotype.Component;

import java.time.DateTimeException;
import java.time.LocalDate;

@Component
public class EventOccurrenceCalculator {
    public LocalDate nextOccurrence(EventEntity event, LocalDate today) {
        return nextOccurrence(event.getDate(), event.getRepeat(), today);
    }

    public LocalDate nextOccurrence(LocalDate baseDate, String repeat, LocalDate today) {
        if (baseDate == null || today == null) {
            throw new IllegalArgumentException("事件日期不能为空");
        }
        String rule = repeat == null || repeat.isBlank() ? "none" : repeat;
        return switch (rule) {
            case "yearly" -> nextYearly(baseDate, today);
            case "monthly" -> nextMonthly(baseDate, today);
            case "none" -> baseDate.isBefore(today) ? null : baseDate;
            default -> {
                // 节日/农历换算由小程序完成，后端暂按客户端已解析的 date 使用，不重复换算。
                yield baseDate.isBefore(today) ? null : baseDate;
            }
        };
    }

    private LocalDate nextYearly(LocalDate baseDate, LocalDate today) {
        LocalDate candidate = safeDate(today.getYear(), baseDate.getMonthValue(), baseDate.getDayOfMonth());
        return candidate.isBefore(today)
                ? safeDate(today.getYear() + 1, baseDate.getMonthValue(), baseDate.getDayOfMonth())
                : candidate;
    }

    private LocalDate nextMonthly(LocalDate baseDate, LocalDate today) {
        LocalDate candidate = safeDate(today.getYear(), today.getMonthValue(), baseDate.getDayOfMonth());
        if (!candidate.isBefore(today)) {
            return candidate;
        }
        LocalDate nextMonth = today.plusMonths(1);
        return safeDate(nextMonth.getYear(), nextMonth.getMonthValue(), baseDate.getDayOfMonth());
    }

    private LocalDate safeDate(int year, int month, int day) {
        try {
            return LocalDate.of(year, month, day);
        } catch (DateTimeException ignored) {
            // 月度事件的 29/30/31 日在较短月份落到当月最后一天。
            return LocalDate.of(year, month, 1).withDayOfMonth(
                    LocalDate.of(year, month, 1).lengthOfMonth());
        }
    }
}
