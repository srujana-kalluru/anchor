package app.anchor.web;

import app.anchor.domain.MenuItem;
import app.anchor.domain.Source;
import app.anchor.domain.UserAccount;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.web.Dtos.*;
import org.openapitools.jackson.nullable.JsonNullable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class UserController {

    private final Repos.Users users;
    private final Repos.Sources sources;
    private final Repos.Menu menu;
    private final Repos.Activity activity;
    private final CurrentUser currentUser;

    public UserController(Repos.Users users, Repos.Sources sources, Repos.Menu menu, Repos.Activity activity,
                          CurrentUser currentUser) {
        this.users = users;
        this.sources = sources;
        this.menu = menu;
        this.activity = activity;
        this.currentUser = currentUser;
    }

    @GetMapping("/users/me")
    public UserDto me() {
        return UserDto.of(currentUser.get());
    }

    @PatchMapping("/users/me")
    @Transactional
    public UserDto patch(@RequestBody PatchUser req) {
        UserAccount u = currentUser.get();
        if (present(req.displayName())) u.setDisplayName(req.displayName().get());
        if (present(req.timezone())) u.setTimezone(req.timezone().get());
        if (present(req.digestEnabled())) u.setDigestEnabled(req.digestEnabled().get());
        if (present(req.digestTime())) u.setDigestTime(LocalTime.parse(req.digestTime().get()));
        if (present(req.focusMinutes())) u.setFocusMinutes(clamp(req.focusMinutes().get(), 5, 120));
        if (present(req.breakMinutes())) u.setBreakMinutes(clamp(req.breakMinutes().get(), 1, 60));
        if (present(req.keepScreenOn())) u.setKeepScreenOn(req.keepScreenOn().get());
        if (present(req.driveBackupEnabled())) u.setDriveBackupEnabled(req.driveBackupEnabled().get());
        return UserDto.of(users.save(u));
    }

    @DeleteMapping("/users/me")
    @Transactional
    public Ok deleteAccount() {
        // Cascading FKs remove every row the account owns; the Supabase auth identity is
        // managed in the Supabase dashboard and is not touched here.
        users.deleteById(currentUser.id());
        return Ok.OK;
    }

    @PostMapping("/users/me/starter")
    @Transactional
    public Ok starter(@RequestBody StarterRequest req) {
        UserAccount u = currentUser.get();
        if (u.getStarterOfferedAt() != null) {
            return Ok.OK;
        }
        if (req.sources() != null) {
            for (String name : req.sources()) {
                Source s = new Source();
                s.setId(UUID.randomUUID());
                s.setUserId(u.getId());
                s.setName(name.trim());
                sources.save(s);
            }
        }
        if (req.menuItems() != null) {
            int order = 0;
            for (StarterMenuItem item : req.menuItems()) {
                MenuItem m = new MenuItem();
                m.setId(UUID.randomUUID());
                m.setUserId(u.getId());
                m.setCourse(item.course());
                m.setLabel(item.label().trim());
                m.setDurationMinutes(item.durationMinutes());
                m.setSortOrder(order++);
                menu.save(m);
            }
        }
        u.setStarterOfferedAt(Instant.now());
        users.save(u);
        return Ok.OK;
    }

    @PostMapping("/activity/ping")
    @Transactional
    public Ok ping(@RequestBody ActivityPing req) {
        LocalDate day = req.date() != null ? req.date() : LocalDate.now();
        activity.ping(currentUser.get().getId(), day);
        return Ok.OK;
    }

    private static boolean present(JsonNullable<?> v) {
        return v != null && v.isPresent();
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
