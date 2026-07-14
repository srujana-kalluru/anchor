package app.anchor.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
public class UserAccount {
    @Id
    private UUID id;

    private String email;

    @Column(name = "display_name")
    private String displayName;

    private String timezone = "UTC";

    @Column(name = "digest_enabled")
    private boolean digestEnabled;

    @Column(name = "digest_time")
    private LocalTime digestTime = LocalTime.of(9, 0);

    @Column(name = "last_digest_date")
    private LocalDate lastDigestDate;

    @Column(name = "starter_offered_at")
    private Instant starterOfferedAt;

    @Column(name = "focus_minutes")
    private int focusMinutes = 25;

    @Column(name = "break_minutes")
    private int breakMinutes = 5;

    @Column(name = "keep_screen_on")
    private boolean keepScreenOn;

    @Column(name = "google_refresh_token")
    private String googleRefreshToken;

    @Column(name = "drive_backup_enabled")
    private boolean driveBackupEnabled = true;

    @Column(name = "last_drive_backup_at")
    private Instant lastDriveBackupAt;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
