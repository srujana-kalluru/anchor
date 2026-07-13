package app.anchor.service;

import app.anchor.repo.Repos;
import app.anchor.web.Dtos.*;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

@Service
public class InsightsService {

    private final EntityManager em;
    private final Repos.Sessions sessions;
    private final Repos.Activity activity;
    private final CurrentUser currentUser;

    public InsightsService(EntityManager em, Repos.Sessions sessions, Repos.Activity activity,
                           CurrentUser currentUser) {
        this.em = em;
        this.sessions = sessions;
        this.activity = activity;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public InsightsSummary summary(int weeks) {
        var user = currentUser.get();
        UUID uid = user.getId();
        ZoneId zone = TaskService.zoneOf(user.getTimezone());
        Instant now = Instant.now();
        Instant weekAgo = now.minus(Duration.ofDays(7));
        Instant twoWeeksAgo = now.minus(Duration.ofDays(14));
        Instant rangeStart = now.minus(Duration.ofDays(7L * Math.max(1, weeks)));

        WeekStats thisWeek = new WeekStats(
            countCaptured(uid, weekAgo, now),
            countCompleted(uid, weekAgo, now),
            sessions.countByUserIdAndCompletedTrueAndEndedAtAfter(uid, weekAgo));
        WeekStats lastWeek = new WeekStats(
            countCaptured(uid, twoWeeksAgo, weekAgo),
            countCompleted(uid, twoWeeksAgo, weekAgo),
            sessions.countByUserIdAndCompletedTrueAndEndedAtBetween(uid, twoWeeksAgo, weekAgo));

        LocalDate today = LocalDate.now(zone);
        LocalDate fortnightAgo = today.minusDays(14);
        int daysUsed = activity.countDaysSince(uid, fortnightAgo);
        List<LocalDate> activeDays = activity.daysSince(uid, fortnightAgo);

        Long median = medianFlowSeconds(uid, rangeStart);
        List<NamedCount> bySource = namedCounts(uid, rangeStart, """
            select coalesce(s.name, 'No source') as name, count(*) as c
            from tasks t left join sources s on s.id = t.source_id
            where t.user_id = :uid and t.deleted_at is null and t.captured_at >= :start
            group by 1 order by c desc
            """);
        List<NamedCount> byCategory = namedCounts(uid, rangeStart, """
            select coalesce(c.name, 'Uncategorised') as name, count(*) as c
            from tasks t left join categories c on c.id = t.category_id
            where t.user_id = :uid and t.deleted_at is null and t.captured_at >= :start
            group by 1 order by c desc
            """);

        Object[] simmer = (Object[]) em.createNativeQuery("""
            select count(*),
                   max(extract(epoch from (now() - greatest(coalesce(t.last_acted_at, t.captured_at), t.captured_at))))
            from tasks t
            where t.user_id = :uid and t.deleted_at is null and t.status <> 'done'
              and (t.due_date is null or t.due_date <= current_date)
              and greatest(coalesce(t.last_acted_at, t.captured_at), t.captured_at) <= now() - interval '14 days'
            """).setParameter("uid", uid).getSingleResult();
        long simmeringCount = ((Number) simmer[0]).longValue();
        Integer oldestDays = simmer[1] == null ? null : (int) (((Number) simmer[1]).longValue() / 86400);

        return new InsightsSummary(thisWeek, lastWeek, daysUsed, activeDays, median, bySource, byCategory,
            simmeringCount, oldestDays);
    }

    private long countCaptured(UUID uid, Instant from, Instant to) {
        return ((Number) em.createNativeQuery(
                "select count(*) from tasks where user_id = :uid and deleted_at is null and captured_at >= :f and captured_at < :t")
            .setParameter("uid", uid).setParameter("f", from).setParameter("t", to).getSingleResult()).longValue();
    }

    private long countCompleted(UUID uid, Instant from, Instant to) {
        return ((Number) em.createNativeQuery(
                "select count(*) from tasks where user_id = :uid and deleted_at is null and completed_at >= :f and completed_at < :t")
            .setParameter("uid", uid).setParameter("f", from).setParameter("t", to).getSingleResult()).longValue();
    }

    private Long medianFlowSeconds(UUID uid, Instant start) {
        Object r = em.createNativeQuery("""
                select percentile_cont(0.5) within group (order by extract(epoch from (completed_at - captured_at)))
                from tasks
                where user_id = :uid and deleted_at is null and completed_at >= :start and completed_at is not null
                """)
            .setParameter("uid", uid).setParameter("start", start).getSingleResult();
        return r == null ? null : ((Number) r).longValue();
    }

    @SuppressWarnings("unchecked")
    private List<NamedCount> namedCounts(UUID uid, Instant start, String sql) {
        List<Object[]> rows = em.createNativeQuery(sql)
            .setParameter("uid", uid).setParameter("start", start).getResultList();
        return rows.stream().map(r -> new NamedCount((String) r[0], ((Number) r[1]).longValue())).toList();
    }
}
