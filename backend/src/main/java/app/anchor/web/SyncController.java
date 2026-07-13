package app.anchor.web;

import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.service.TaskService;
import app.anchor.web.Dtos.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

    private final Repos.Tasks tasks;
    private final Repos.Steps steps;
    private final Repos.Categories categories;
    private final Repos.Sources sources;
    private final Repos.Requestors requestors;
    private final Repos.Menu menu;
    private final Repos.Sessions sessions;
    private final TaskService taskService;
    private final CurrentUser currentUser;

    public SyncController(Repos.Tasks tasks, Repos.Steps steps, Repos.Categories categories, Repos.Sources sources,
                          Repos.Requestors requestors, Repos.Menu menu, Repos.Sessions sessions,
                          TaskService taskService, CurrentUser currentUser) {
        this.tasks = tasks;
        this.steps = steps;
        this.categories = categories;
        this.sources = sources;
        this.requestors = requestors;
        this.menu = menu;
        this.sessions = sessions;
        this.taskService = taskService;
        this.currentUser = currentUser;
    }

    /** Soft-deleted records are included so an offline device learns about deletions on reconnect. */
    @GetMapping("/delta")
    @Transactional(readOnly = true)
    public Delta delta(@RequestParam("since") Instant since) {
        UUID uid = currentUser.get().getId();
        Instant serverTime = Instant.now();
        return new Delta(
            serverTime,
            taskService.toDtos(tasks.findByUserIdAndUpdatedAtAfter(uid, since)),
            steps.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(StepDto::of).toList(),
            categories.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(CategoryDto::of).toList(),
            sources.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(SourceDto::of).toList(),
            requestors.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(RequestorDto::of).toList(),
            menu.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(MenuItemDto::of).toList(),
            sessions.findByUserIdAndUpdatedAtAfter(uid, since).stream().map(SessionDto::of).toList());
    }
}
