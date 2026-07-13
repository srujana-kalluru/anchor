package app.anchor.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tasks")
@Getter
@Setter
public class Task {
    @Id
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    private String title;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "source_id")
    private UUID sourceId;

    @Column(name = "requestor_id")
    private UUID requestorId;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence")
    private Recurrence recurrence;

    @Column(name = "recurred_from")
    private UUID recurredFrom;

    @Enumerated(EnumType.STRING)
    private TaskStatus status = TaskStatus.backlog;

    @Column(name = "captured_at")
    private Instant capturedAt;

    @Column(name = "last_acted_at")
    private Instant lastActedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "sort_order")
    private int sortOrder;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (capturedAt == null) capturedAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
