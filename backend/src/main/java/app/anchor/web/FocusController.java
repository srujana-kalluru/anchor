package app.anchor.web;

import app.anchor.domain.FocusSession;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.service.TaskService;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/focus-sessions")
public class FocusController {

    private final Repos.Sessions sessions;
    private final TaskService taskService;
    private final CurrentUser currentUser;

    public FocusController(Repos.Sessions sessions, TaskService taskService, CurrentUser currentUser) {
        this.sessions = sessions;
        this.taskService = taskService;
        this.currentUser = currentUser;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public SessionDto create(@RequestBody CreateSession req) {
        UUID uid = currentUser.get().getId();
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        return sessions.findByIdAndUserId(id, uid).map(SessionDto::of).orElseGet(() -> {
            FocusSession s = new FocusSession();
            s.setId(id);
            s.setUserId(uid);
            s.setTaskId(req.taskId());
            s.setStartedAt(req.startedAt() != null ? req.startedAt() : Instant.now());
            return SessionDto.of(sessions.save(s));
        });
    }

    @PatchMapping("/{id}")
    @Transactional
    public SessionDto patch(@PathVariable UUID id, @RequestBody PatchSession req) {
        UUID uid = currentUser.id();
        FocusSession s = sessions.findByIdAndUserId(id, uid)
            .orElseThrow(() -> new NotFoundException("session not found"));
        if (req.endedAt() != null) s.setEndedAt(req.endedAt());
        if (req.completed() != null) {
            s.setCompleted(req.completed());
            if (req.completed()) {
                taskService.markProgress(s.getTaskId(), uid);
            }
        }
        return SessionDto.of(sessions.save(s));
    }
}
