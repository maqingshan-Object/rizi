package cn.rizimianmian.backend.events;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

public final class EventDtos {
    private EventDtos() {}

    public record EventRequest(
            @Size(max = 36) String id,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 2000) String note,
            @NotNull LocalDate date,
            @Size(max = 40) String category,
            @Size(max = 40) String mode,
            @Size(max = 20) String repeat,
            @Size(max = 20) String calendarType,
            @Size(max = 80) String holidayKey,
            Integer lunarMonth,
            Integer lunarDay,
            Boolean lunarLeap,
            @Size(max = 60) String icon,
            @Size(max = 60) String tint,
            Boolean pin,
            @Size(max = 60) String reminder,
            Boolean reminderEnabled,
            Integer reminderDaysBefore,
            LocalTime reminderTime,
            Boolean sample
    ) {}

    public record EventView(
            String id,
            String name,
            String note,
            LocalDate date,
            String category,
            String mode,
            String repeat,
            String calendarType,
            String holidayKey,
            Integer lunarMonth,
            Integer lunarDay,
            Boolean lunarLeap,
            String icon,
            String tint,
            boolean pin,
            String reminder,
            boolean reminderEnabled,
            int reminderDaysBefore,
            LocalTime reminderTime,
            boolean sample
    ) {
        public static EventView from(EventEntity event) {
            return new EventView(event.getId(), event.getName(), event.getNote(), event.getDate(),
                    event.getCategory(), event.getMode(), event.getRepeat(), event.getCalendarType(),
                    event.getHolidayKey(), event.getLunarMonth(), event.getLunarDay(), event.getLunarLeap(),
                    event.getIcon(), event.getTint(), event.isPin(), event.getReminder(),
                    event.isReminderEnabled(), event.getReminderDaysBefore(), event.getReminderTime(), event.isSample());
        }
    }
}