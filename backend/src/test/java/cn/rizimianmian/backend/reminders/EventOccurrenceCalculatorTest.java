package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class EventOccurrenceCalculatorTest {
    private final EventOccurrenceCalculator calculator = new EventOccurrenceCalculator();

    @Test
    void monthly31stFallsBackToShortMonthEnd() {
        assertEquals(LocalDate.of(2026, 2, 28),
                calculator.nextOccurrence(LocalDate.of(2025, 1, 31), "monthly", LocalDate.of(2026, 2, 1)));
        assertEquals(LocalDate.of(2028, 2, 29),
                calculator.nextOccurrence(LocalDate.of(2025, 1, 31), "monthly", LocalDate.of(2028, 2, 1)));
    }

    @Test
    void oneOffPastEventHasNoNextOccurrence() {
        assertNull(calculator.nextOccurrence(LocalDate.of(2026, 1, 1), "none", LocalDate.of(2026, 1, 2)));
    }
}
