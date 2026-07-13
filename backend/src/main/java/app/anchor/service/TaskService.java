package app.anchor.service;

import app.anchor.domain.*;
import app.anchor.repo.Repos;
import app.anchor.web.ApiErrors.ConflictException;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos;
import app.anchor.web.Dtos.*;
import org.openapitools.jackson.nullable.JsonNullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class TaskService {

    private final Repos.Tasks tasks;
    private final Repos.Steps steps;
    private final Repos.Requestors requestors;
    private final Repos.Users users;
    private final CurrentUser currentUser;

    public TaskService(Repos.Tasks tasks, Repos.Steps steps, Repos.Requestors requestors, Repos.Users users,
                       CurrentUser currentUser) {
        this.tasks = tasks;
        this.steps = steps;
        this.requestors = requestors;
        this.users = users;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<TaskDto> listActive() {
        UUID uid = currentUser.id();
        List<Task> active = tasks.findActive(uid, Instant.now().minus(Duration.ofDays(7)));
        return toDtos(active);
    }

    @Transactional
    public TaskDto create(CreateTask req) {
        UUID uid = currentUser.get().getId();
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        // Idempotent create: an offline queue may replay the same POST after a lost response.
        Optional<Task> existing = tasks.findByIdAndUserId(id, uid);
        if (existing.isPresent()) {
            return toDto(existing.get());
        }
        Task t = new Task();
        t.setId(id);
        t.setUserId(uid);
        t.setTitle(req.title().trim());
        t.setCategoryId(req.categoryId());
        t.setSourceId(req.sourceId());
        t.setDueDate(req.dueDate());
        t.setRecurrence(req.recurrence());
        t.setStatus(req.status() != null ? req.status() : TaskStatus.backlog);
        t.setCapturedAt(req.capturedAt() != null ? req.capturedAt() : Instant.now());
        t.setSortOrder(tasks.maxSortOrder(uid) + 1);
        if (req.requestorName() != null && !req.requestorName().isBlank()) {
            t.setRequestorId(upsertRequestor(uid, req.requestorName().trim()).getId());
        }
        return toDto(tasks.save(t));
    }

    @Transactional
    public TaskPatchResult patch(UUID id, PatchTask req) {
        UUID uid = currentUser.id();
        Task t = tasks.findByIdAndUserId(id, uid).orElseThrow(() -> new NotFoundException("task not found"));
        guardLww(t.getUpdatedAt(), req.opTimestamp(), () -> toDto(t));

        TaskStatus before = t.getStatus();
        apply(req.title(), v -> t.setTitle(v.trim()));
        apply(req.categoryId(), t::setCategoryId);
        apply(req.sourceId(), t::setSourceId);
        apply(req.dueDate(), t::setDueDate);
        apply(req.recurrence(), t::setRecurrence);
        apply(req.sortOrder(), t::setSortOrder);
        if (req.requestorName() != null && req.requestorName().isPresent()) {
            String name = req.requestorName().get();
            t.setRequestorId(name == null || name.isBlank() ? null : upsertRequestor(uid, name.trim()).getId());
        }

        Task next = null;
        if (req.status() != null && req.status().isPresent()) {
            TaskStatus to = req.status().get();
            t.setStatus(to);
            if (to != before) {
                t.setLastActedAt(Instant.now());
            }
            if (to == TaskStatus.done && before != TaskStatus.done) {
                t.setCompletedAt(Instant.now());
                if (t.getRecurrence() != null) {
                    next = spawnNextInstance(t);
                }
            }
            if (to != TaskStatus.done) {
                t.setCompletedAt(null);
            }
        }
        Task saved = tasks.save(t);
        return new TaskPatchResult(toDto(saved), next != null ? toDto(next) : null);
    }

    @Transactional
    public void delete(UUID id) {
        UUID uid = currentUser.id();
        Task t = tasks.findByIdAndUserId(id, uid).orElseThrow(() -> new NotFoundException("task not found"));
        t.setDeletedAt(Instant.now());
        tasks.save(t);
    }

    @Transactional
    public StepDto addStep(UUID taskId, CreateStep req) {
        UUID uid = currentUser.id();
        Task t = tasks.findByIdAndUserId(taskId, uid).orElseThrow(() -> new NotFoundException("task not found"));
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        Optional<Step> existing = steps.findByIdAndUserId(id, uid);
        if (existing.isPresent()) {
            return StepDto.of(existing.get());
        }
        Step s = new Step();
        s.setId(id);
        s.setTaskId(t.getId());
        s.setUserId(uid);
        s.setTitle(req.title().trim());
        s.setSortOrder(req.sortOrder() != null ? req.sortOrder()
            : steps.findByTaskIdAndDeletedAtIsNullOrderBySortOrder(taskId).size());
        return StepDto.of(steps.save(s));
    }

    @Transactional
    public StepDto patchStep(UUID id, PatchStep req) {
        UUID uid = currentUser.id();
        Step s = steps.findByIdAndUserId(id, uid).orElseThrow(() -> new NotFoundException("step not found"));
        guardLww(s.getUpdatedAt(), req.opTimestamp(), () -> StepDto.of(s));
        apply(req.title(), v -> s.setTitle(v.trim()));
        apply(req.sortOrder(), s::setSortOrder);
        if (req.complete() != null && req.complete().isPresent()) {
            boolean was = s.isComplete();
            s.setComplete(req.complete().get());
            if (!was && s.isComplete()) {
                markProgress(s.getTaskId(), uid);
            }
        }
        return StepDto.of(steps.save(s));
    }

    @Transactional
    public void deleteStep(UUID id) {
        UUID uid = currentUser.id();
        Step s = steps.findByIdAndUserId(id, uid).orElseThrow(() -> new NotFoundException("step not found"));
        s.setDeletedAt(Instant.now());
        steps.save(s);
    }

    @Transactional
    public void markProgress(UUID taskId, UUID uid) {
        tasks.findByIdAndUserId(taskId, uid).ifPresent(t -> {
            t.setLastActedAt(Instant.now());
            tasks.save(t);
        });
    }

    private Task spawnNextInstance(Task done) {
        ZoneId zone = users.findById(done.getUserId()).map(u -> zoneOf(u.getTimezone())).orElse(ZoneId.of("UTC"));
        LocalDate today = LocalDate.now(zone);
        Task next = new Task();
        next.setId(UUID.randomUUID());
        next.setUserId(done.getUserId());
        next.setTitle(done.getTitle());
        next.setCategoryId(done.getCategoryId());
        next.setSourceId(done.getSourceId());
        next.setRequestorId(done.getRequestorId());
        next.setRecurrence(done.getRecurrence());
        next.setRecurredFrom(done.getId());
        next.setStatus(TaskStatus.backlog);
        next.setDueDate(RecurrenceCalculator.nextDue(done.getDueDate(), today, done.getRecurrence()));
        next.setSortOrder(done.getSortOrder());
        Task saved = tasks.save(next);
        List<Step> template = steps.findByTaskIdAndDeletedAtIsNullOrderBySortOrder(done.getId());
        for (Step src : template) {
            Step copy = new Step();
            copy.setId(UUID.randomUUID());
            copy.setTaskId(saved.getId());
            copy.setUserId(done.getUserId());
            copy.setTitle(src.getTitle());
            copy.setSortOrder(src.getSortOrder());
            steps.save(copy);
        }
        return saved;
    }

    private Requestor upsertRequestor(UUID uid, String name) {
        Requestor r = requestors.findByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(uid, name).orElseGet(() -> {
            Requestor n = new Requestor();
            n.setId(UUID.randomUUID());
            n.setUserId(uid);
            n.setName(name);
            return n;
        });
        r.setUseCount(r.getUseCount() + 1);
        return requestors.save(r);
    }

    static void guardLww(Instant stored, Instant op, java.util.function.Supplier<Object> current) {
        if (op != null && stored != null && stored.isAfter(op)) {
            throw new ConflictException(current.get());
        }
    }

    private static <T> void apply(JsonNullable<T> field, java.util.function.Consumer<T> setter) {
        if (field != null && field.isPresent()) {
            setter.accept(field.get());
        }
    }

    static ZoneId zoneOf(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (Exception e) {
            return ZoneId.of("UTC");
        }
    }

    TaskDto toDto(Task t) {
        return toDtos(List.of(t)).get(0);
    }

    public List<TaskDto> toDtos(List<Task> list) {
        if (list.isEmpty()) return List.of();
        List<UUID> ids = list.stream().map(Task::getId).toList();
        Map<UUID, List<StepDto>> byTask = steps.findByTaskIdInAndDeletedAtIsNull(ids).stream()
            .sorted(Comparator.comparingInt(Step::getSortOrder))
            .map(StepDto::of)
            .collect(Collectors.groupingBy(StepDto::taskId));
        Map<UUID, String> names = requestorNames(list);
        return list.stream()
            .map(t -> TaskDto.of(t, t.getRequestorId() != null ? names.get(t.getRequestorId()) : null,
                byTask.getOrDefault(t.getId(), List.of())))
            .toList();
    }

    private Map<UUID, String> requestorNames(List<Task> list) {
        List<UUID> rids = list.stream().map(Task::getRequestorId).filter(Objects::nonNull).distinct().toList();
        if (rids.isEmpty()) return Map.of();
        return requestors.findAllById(rids).stream()
            .collect(Collectors.toMap(Requestor::getId, Requestor::getName));
    }
}
