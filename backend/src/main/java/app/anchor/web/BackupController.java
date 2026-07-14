package app.anchor.web;

import app.anchor.domain.UserAccount;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.service.GoogleDriveBackupService;
import app.anchor.web.Dtos.UserDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/backup")
public class BackupController {

    private static final Logger log = LoggerFactory.getLogger(BackupController.class);

    private final Repos.Users users;
    private final CurrentUser currentUser;
    private final GoogleDriveBackupService backup;

    public BackupController(Repos.Users users, CurrentUser currentUser, GoogleDriveBackupService backup) {
        this.users = users;
        this.currentUser = currentUser;
        this.backup = backup;
    }

    public record Credential(String refreshToken) {}

    /** Stores the Google refresh token captured at sign-in and runs the first backup. */
    @PostMapping("/credential")
    @Transactional
    public UserDto credential(@RequestBody Credential req) {
        UserAccount u = currentUser.get();
        if (req.refreshToken() != null && !req.refreshToken().isBlank()) {
            u.setGoogleRefreshToken(req.refreshToken().trim());
            u.setDriveBackupEnabled(true);
            users.save(u);
            runQuietly(u);
        }
        return UserDto.of(u);
    }

    @PostMapping("/run")
    @Transactional
    public UserDto run() {
        UserAccount u = currentUser.get();
        runQuietly(u);
        return UserDto.of(u);
    }

    private void runQuietly(UserAccount u) {
        if (!backup.configured() || u.getGoogleRefreshToken() == null) return;
        try {
            backup.backup(u);
        } catch (Exception e) {
            log.warn("on-demand drive backup failed for {}: {}", u.getId(), e.getMessage());
        }
    }
}
