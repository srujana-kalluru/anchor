package app.anchor.web;

import app.anchor.domain.*;
import org.openapitools.jackson.nullable.JsonNullable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class Dtos {
    private Dtos() {}

    public record StepDto(UUID id, UUID taskId, String title, boolean complete, int sortOrder, Instant updatedAt,
                          Instant deletedAt) {
        public static StepDto of(Step s) {
            return new StepDto(s.getId(), s.getTaskId(), s.getTitle(), s.isComplete(), s.getSortOrder(),
                s.getUpdatedAt(), s.getDeletedAt());
        }
    }

    public record TaskDto(UUID id, String title, UUID categoryId, UUID sourceId, UUID requestorId,
                          String requestorName, LocalDate dueDate, Recurrence recurrence, UUID recurredFrom,
                          TaskStatus status, Instant capturedAt, Instant lastActedAt, Instant completedAt,
                          int sortOrder, Instant updatedAt, Instant deletedAt, List<StepDto> steps) {
        public static TaskDto of(Task t, String requestorName, List<StepDto> steps) {
            return new TaskDto(t.getId(), t.getTitle(), t.getCategoryId(), t.getSourceId(), t.getRequestorId(),
                requestorName, t.getDueDate(), t.getRecurrence(), t.getRecurredFrom(), t.getStatus(),
                t.getCapturedAt(), t.getLastActedAt(), t.getCompletedAt(), t.getSortOrder(), t.getUpdatedAt(),
                t.getDeletedAt(), steps);
        }
    }

    /** PATCH response; nextInstance is present only when completing a recurring task spawned a new cycle. */
    public record TaskPatchResult(TaskDto task, TaskDto nextInstance) {}

    public record CreateTask(UUID id, String title, UUID categoryId, UUID sourceId, String requestorName,
                             LocalDate dueDate, Recurrence recurrence, TaskStatus status, Instant capturedAt) {}

    public record PatchTask(JsonNullable<String> title, JsonNullable<UUID> categoryId, JsonNullable<UUID> sourceId,
                            JsonNullable<String> requestorName, JsonNullable<LocalDate> dueDate,
                            JsonNullable<Recurrence> recurrence, JsonNullable<TaskStatus> status,
                            JsonNullable<Integer> sortOrder, Instant opTimestamp) {}

    public record CreateStep(UUID id, String title, Integer sortOrder) {}

    public record PatchStep(JsonNullable<String> title, JsonNullable<Boolean> complete,
                            JsonNullable<Integer> sortOrder, Instant opTimestamp) {}

    public record CategoryDto(UUID id, String name, String colourHex, Instant updatedAt, Instant deletedAt) {
        public static CategoryDto of(Category c) {
            return new CategoryDto(c.getId(), c.getName(), c.getColourHex(), c.getUpdatedAt(), c.getDeletedAt());
        }
    }

    public record UpsertCategory(UUID id, String name, String colourHex) {}

    public record SourceDto(UUID id, String name, Instant updatedAt, Instant deletedAt) {
        public static SourceDto of(Source s) {
            return new SourceDto(s.getId(), s.getName(), s.getUpdatedAt(), s.getDeletedAt());
        }
    }

    public record UpsertSource(UUID id, String name) {}

    public record RequestorDto(UUID id, String name, int useCount, Instant updatedAt, Instant deletedAt) {
        public static RequestorDto of(Requestor r) {
            return new RequestorDto(r.getId(), r.getName(), r.getUseCount(), r.getUpdatedAt(), r.getDeletedAt());
        }
    }

    public record MenuItemDto(UUID id, MenuCourse course, String label, Integer durationMinutes, int sortOrder,
                              Instant updatedAt, Instant deletedAt) {
        public static MenuItemDto of(MenuItem m) {
            return new MenuItemDto(m.getId(), m.getCourse(), m.getLabel(), m.getDurationMinutes(), m.getSortOrder(),
                m.getUpdatedAt(), m.getDeletedAt());
        }
    }

    public record UpsertMenuItem(UUID id, MenuCourse course, String label, Integer durationMinutes,
                                 Integer sortOrder) {}

    public record SessionDto(UUID id, UUID taskId, Instant startedAt, Instant endedAt, boolean completed) {
        public static SessionDto of(FocusSession s) {
            return new SessionDto(s.getId(), s.getTaskId(), s.getStartedAt(), s.getEndedAt(), s.isCompleted());
        }
    }

    public record CreateSession(UUID id, UUID taskId, Instant startedAt) {}

    public record PatchSession(Instant endedAt, Boolean completed) {}

    public record UserDto(UUID id, String email, String displayName, String timezone, boolean digestEnabled,
                          String digestTime, boolean starterOffered, int focusMinutes, int breakMinutes,
                          boolean keepScreenOn, boolean driveBackupEnabled, boolean driveBackupReady,
                          Instant lastDriveBackupAt) {
        public static UserDto of(UserAccount u) {
            return new UserDto(u.getId(), u.getEmail(), u.getDisplayName(), u.getTimezone(), u.isDigestEnabled(),
                u.getDigestTime().toString(), u.getStarterOfferedAt() != null, u.getFocusMinutes(),
                u.getBreakMinutes(), u.isKeepScreenOn(), u.isDriveBackupEnabled(),
                u.getGoogleRefreshToken() != null, u.getLastDriveBackupAt());
        }
    }

    public record PatchUser(JsonNullable<String> displayName, JsonNullable<String> timezone,
                            JsonNullable<Boolean> digestEnabled, JsonNullable<String> digestTime,
                            JsonNullable<Integer> focusMinutes, JsonNullable<Integer> breakMinutes,
                            JsonNullable<Boolean> keepScreenOn, JsonNullable<Boolean> driveBackupEnabled) {}

    public record StarterRequest(List<String> sources, List<StarterMenuItem> menuItems) {}

    public record StarterMenuItem(MenuCourse course, String label, Integer durationMinutes) {}

    public record ActivityPing(LocalDate date) {}

    public record PushSubscribe(UUID id, String endpoint, String p256dh, String auth) {}

    public record PushSubscriptionDto(UUID id, String endpoint) {}

    public record WeekStats(long captured, long completed, long focusSessions) {}

    public record NamedCount(String name, long count) {}

    public record InsightsSummary(WeekStats thisWeek, WeekStats lastWeek, int daysUsedOfLast14,
                                  List<LocalDate> activeDays, Long flowMedianSeconds, List<NamedCount> sources,
                                  List<NamedCount> categories, long simmeringCount, Integer oldestSimmeringDays) {}

    public record Delta(Instant serverTime, List<TaskDto> tasks, List<StepDto> steps, List<CategoryDto> categories,
                        List<SourceDto> sources, List<RequestorDto> requestors, List<MenuItemDto> menuItems,
                        List<SessionDto> focusSessions) {}

    public record Ok(String status) {
        public static final Ok OK = new Ok("ok");
    }

    public static Map<String, Object> ngswPayload(String body, String url) {
        return Map.of("notification", Map.of(
            "title", "Anchor",
            "body", body,
            "data", Map.of("onActionClick", Map.of(
                "default", Map.of("operation", "navigateLastFocusedOrOpen", "url", url)))));
    }
}
