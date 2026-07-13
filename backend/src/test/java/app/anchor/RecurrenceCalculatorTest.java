package app.anchor;

import app.anchor.domain.Recurrence;
import app.anchor.service.RecurrenceCalculator;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecurrenceCalculatorTest {

    private final LocalDate monday = LocalDate.of(2026, 7, 13);

    @Test
    void dailyAdvancesOneDay() {
        assertEquals(monday.plusDays(1), RecurrenceCalculator.nextDue(monday, monday, Recurrence.daily));
    }

    @Test
    void weekdaysSkipsWeekend() {
        LocalDate friday = LocalDate.of(2026, 7, 17);
        assertEquals(LocalDate.of(2026, 7, 20), RecurrenceCalculator.nextDue(friday, friday, Recurrence.weekdays));
    }

    @Test
    void weeklyAdvancesSevenDays() {
        assertEquals(monday.plusWeeks(1), RecurrenceCalculator.nextDue(monday, monday, Recurrence.weekly));
    }

    @Test
    void monthlyClampsEndOfMonth() {
        LocalDate jan31 = LocalDate.of(2026, 1, 31);
        assertEquals(LocalDate.of(2026, 2, 28), RecurrenceCalculator.nextDue(jan31, jan31, Recurrence.monthly));
    }

    @Test
    void lateCompletionLandsInFuture() {
        LocalDate dueTwoWeeksAgo = monday.minusWeeks(2);
        LocalDate next = RecurrenceCalculator.nextDue(dueTwoWeeksAgo, monday, Recurrence.weekly);
        assertEquals(monday.plusWeeks(1), next);
    }

    @Test
    void nullDueDateAnchorsToToday() {
        assertEquals(monday.plusDays(1), RecurrenceCalculator.nextDue(null, monday, Recurrence.daily));
    }
}
