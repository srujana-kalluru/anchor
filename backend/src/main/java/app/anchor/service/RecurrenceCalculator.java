package app.anchor.service;

import app.anchor.domain.Recurrence;

import java.time.DayOfWeek;
import java.time.LocalDate;

public final class RecurrenceCalculator {
    private RecurrenceCalculator() {}

    /**
     * Advances from the task's own due date so the cadence anchors to the schedule, not to when
     * the user happened to finish; a late completion still lands the next cycle in the future.
     */
    public static LocalDate nextDue(LocalDate dueDate, LocalDate today, Recurrence rule) {
        LocalDate base = dueDate != null ? dueDate : today;
        LocalDate next = advance(base, rule);
        while (!next.isAfter(today)) {
            next = advance(next, rule);
        }
        return next;
    }

    private static LocalDate advance(LocalDate d, Recurrence rule) {
        return switch (rule) {
            case daily -> d.plusDays(1);
            case weekdays -> {
                LocalDate n = d.plusDays(1);
                while (n.getDayOfWeek() == DayOfWeek.SATURDAY || n.getDayOfWeek() == DayOfWeek.SUNDAY) {
                    n = n.plusDays(1);
                }
                yield n;
            }
            case weekly -> d.plusWeeks(1);
            case monthly -> d.plusMonths(1);
        };
    }
}
