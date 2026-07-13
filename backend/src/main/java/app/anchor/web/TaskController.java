package app.anchor.web;

import app.anchor.service.TaskService;
import app.anchor.web.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @GetMapping("/tasks")
    public List<TaskDto> list() {
        return service.listActive();
    }

    @PostMapping("/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskDto create(@Valid @RequestBody CreateTask req) {
        return service.create(req);
    }

    @PatchMapping("/tasks/{id}")
    public TaskPatchResult patch(@PathVariable UUID id, @RequestBody PatchTask req) {
        return service.patch(id, req);
    }

    @DeleteMapping("/tasks/{id}")
    public Ok delete(@PathVariable UUID id) {
        service.delete(id);
        return Ok.OK;
    }

    @PostMapping("/tasks/{id}/steps")
    @ResponseStatus(HttpStatus.CREATED)
    public StepDto addStep(@PathVariable UUID id, @Valid @RequestBody CreateStep req) {
        return service.addStep(id, req);
    }

    @PatchMapping("/steps/{id}")
    public StepDto patchStep(@PathVariable UUID id, @RequestBody PatchStep req) {
        return service.patchStep(id, req);
    }

    @DeleteMapping("/steps/{id}")
    public Ok deleteStep(@PathVariable UUID id) {
        service.deleteStep(id);
        return Ok.OK;
    }
}
