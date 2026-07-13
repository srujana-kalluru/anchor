package app.anchor.web;

import app.anchor.domain.MenuItem;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dopamine-menu")
public class MenuController {

    private final Repos.Menu menu;
    private final CurrentUser currentUser;

    public MenuController(Repos.Menu menu, CurrentUser currentUser) {
        this.menu = menu;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<MenuItemDto> list() {
        return menu.findByUserIdAndDeletedAtIsNullOrderByCourseAscSortOrderAsc(currentUser.id())
            .stream().map(MenuItemDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public MenuItemDto create(@RequestBody UpsertMenuItem req) {
        UUID uid = currentUser.get().getId();
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        return menu.findByIdAndUserId(id, uid).map(MenuItemDto::of).orElseGet(() -> {
            MenuItem m = new MenuItem();
            m.setId(id);
            m.setUserId(uid);
            m.setCourse(req.course());
            m.setLabel(req.label().trim());
            m.setDurationMinutes(req.durationMinutes());
            m.setSortOrder(req.sortOrder() != null ? req.sortOrder() : 0);
            return MenuItemDto.of(menu.save(m));
        });
    }

    @PatchMapping("/{id}")
    @Transactional
    public MenuItemDto patch(@PathVariable UUID id, @RequestBody Map<String, Object> req) {
        MenuItem m = menu.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("menu item not found"));
        if (req.containsKey("label")) m.setLabel(((String) req.get("label")).trim());
        if (req.containsKey("durationMinutes")) {
            Object v = req.get("durationMinutes");
            m.setDurationMinutes(v == null ? null : ((Number) v).intValue());
        }
        if (req.containsKey("sortOrder")) m.setSortOrder(((Number) req.get("sortOrder")).intValue());
        return MenuItemDto.of(menu.save(m));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Ok delete(@PathVariable UUID id) {
        MenuItem m = menu.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("menu item not found"));
        m.setDeletedAt(Instant.now());
        menu.save(m);
        return Ok.OK;
    }
}
