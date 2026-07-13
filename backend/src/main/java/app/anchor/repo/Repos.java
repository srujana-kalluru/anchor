package app.anchor.repo;

import app.anchor.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface Repos {

    interface Users extends JpaRepository<UserAccount, UUID> {
        List<UserAccount> findByDigestEnabledTrue();
    }

    interface Tasks extends JpaRepository<Task, UUID> {
        Optional<Task> findByIdAndUserId(UUID id, UUID userId);

        @Query("select t from Task t where t.userId = :uid and t.deletedAt is null and (t.status <> app.anchor.domain.TaskStatus.done or t.completedAt > :doneSince)")
        List<Task> findActive(@Param("uid") UUID userId, @Param("doneSince") Instant doneSince);

        List<Task> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

        @Query("select coalesce(max(t.sortOrder), 0) from Task t where t.userId = :uid and t.deletedAt is null")
        int maxSortOrder(@Param("uid") UUID userId);

        @Query(value = """
            select * from tasks t
            where t.user_id = :uid and t.deleted_at is null and t.status <> 'done'
              and (t.due_date is null or t.due_date <= current_date)
              and greatest(coalesce(t.last_acted_at, t.captured_at), t.captured_at) <= :cutoff
            """, nativeQuery = true)
        List<Task> findAgedBefore(@Param("uid") UUID userId, @Param("cutoff") Instant cutoff);
    }

    interface Steps extends JpaRepository<Step, UUID> {
        Optional<Step> findByIdAndUserId(UUID id, UUID userId);
        List<Step> findByTaskIdInAndDeletedAtIsNull(List<UUID> taskIds);
        List<Step> findByTaskIdAndDeletedAtIsNullOrderBySortOrder(UUID taskId);
        List<Step> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
    }

    interface Categories extends JpaRepository<Category, UUID> {
        Optional<Category> findByIdAndUserId(UUID id, UUID userId);
        List<Category> findByUserIdAndDeletedAtIsNullOrderByName(UUID userId);
        List<Category> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
    }

    interface Sources extends JpaRepository<Source, UUID> {
        Optional<Source> findByIdAndUserId(UUID id, UUID userId);
        List<Source> findByUserIdAndDeletedAtIsNullOrderByCreatedAt(UUID userId);
        List<Source> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
    }

    interface Requestors extends JpaRepository<Requestor, UUID> {
        Optional<Requestor> findByIdAndUserId(UUID id, UUID userId);
        Optional<Requestor> findByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID userId, String name);
        List<Requestor> findByUserIdAndDeletedAtIsNullOrderByUseCountDesc(UUID userId);
        List<Requestor> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
    }

    interface Sessions extends JpaRepository<FocusSession, UUID> {
        Optional<FocusSession> findByIdAndUserId(UUID id, UUID userId);
        List<FocusSession> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
        long countByUserIdAndCompletedTrueAndEndedAtAfter(UUID userId, Instant after);
        long countByUserIdAndCompletedTrueAndEndedAtBetween(UUID userId, Instant from, Instant to);
        Optional<FocusSession> findFirstByUserIdAndCompletedTrueOrderByEndedAtDesc(UUID userId);
    }

    interface Menu extends JpaRepository<MenuItem, UUID> {
        Optional<MenuItem> findByIdAndUserId(UUID id, UUID userId);
        List<MenuItem> findByUserIdAndDeletedAtIsNullOrderByCourseAscSortOrderAsc(UUID userId);
        List<MenuItem> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);
    }

    interface Push extends JpaRepository<PushSubscription, UUID> {
        Optional<PushSubscription> findByIdAndUserId(UUID id, UUID userId);
        Optional<PushSubscription> findByEndpoint(String endpoint);
        List<PushSubscription> findByUserId(UUID userId);
    }

    interface Activity extends JpaRepository<UserActivity, UserActivity.Key> {
        @Modifying
        @Query(value = "insert into user_activity (user_id, activity_date) values (:uid, :day) on conflict do nothing", nativeQuery = true)
        void ping(@Param("uid") UUID userId, @Param("day") LocalDate day);

        @Query("select count(distinct a.activityDate) from UserActivity a where a.userId = :uid and a.activityDate > :after")
        int countDaysSince(@Param("uid") UUID userId, @Param("after") LocalDate after);

        @Query("select a.activityDate from UserActivity a where a.userId = :uid and a.activityDate > :after order by a.activityDate")
        List<LocalDate> daysSince(@Param("uid") UUID userId, @Param("after") LocalDate after);
    }
}
