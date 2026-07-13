package app.anchor.service;

import app.anchor.domain.Task;
import app.anchor.domain.UserAccount;
import app.anchor.repo.Repos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

/**
 * The one notification in the product. At most one send per user per local day, only when a task
 * crossed the 7-day or 14-day threshold in the previous 24 hours. Quiet copy, no escalation.
 */
@Service
public class DigestService {

    private static final Logger log = LoggerFactory.getLogger(DigestService.class);

    private final Repos.Users users;
    private final Repos.Tasks tasks;
    private final PushSender pushSender;

    public DigestService(Repos.Users users, Repos.Tasks tasks, PushSender pushSender) {
        this.users = users;
        this.tasks = tasks;
        this.pushSender = pushSender;
    }

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public void run() {
        for (UserAccount user : users.findByDigestEnabledTrue()) {
            try {
                processUser(user, Instant.now());
            } catch (Exception e) {
                log.warn("digest failed for user {}: {}", user.getId(), e.getMessage());
            }
        }
    }

    void processUser(UserAccount user, Instant now) {
        ZoneId zone = TaskService.zoneOf(user.getTimezone());
        LocalDate today = LocalDate.now(zone);
        if (today.equals(user.getLastDigestDate())) return;
        if (LocalTime.now(zone).isBefore(user.getDigestTime())) return;

        String message = composeMessage(user.getId(), now);
        // The day is marked handled even when silent, so a quiet day stays quiet.
        user.setLastDigestDate(today);
        users.save(user);
        if (message != null) {
            // Relative to the service-worker scope so the link works under a GitHub Pages subpath.
            pushSender.sendToUser(user.getId(), message, "./#/today");
        }
    }

    String composeMessage(java.util.UUID userId, Instant now) {
        List<Task> agedWeek = tasks.findAgedBefore(userId, now.minus(Duration.ofDays(7)));
        List<Task> simmering = tasks.findAgedBefore(userId, now.minus(Duration.ofDays(14)));

        // A basis inside (now-8d, now-7d] crossed the week mark in the last 24h; simmering tasks
        // sit at 14d+ and cannot fall in that window, so the two counts are naturally disjoint.
        Instant weekWindow = now.minus(Duration.ofDays(8));
        Instant simmerWindow = now.minus(Duration.ofDays(15));
        long crossedWeek = agedWeek.stream()
            .filter(t -> basis(t).isAfter(weekWindow))
            .count();
        long crossedSimmer = simmering.stream()
            .filter(t -> basis(t).isAfter(simmerWindow))
            .count();
        if (crossedWeek == 0 && crossedSimmer == 0) return null;

        StringBuilder sb = new StringBuilder();
        if (!simmering.isEmpty()) {
            sb.append(simmering.size() == 1 ? "One task is simmering." : simmering.size() + " tasks are simmering.");
        }
        if (crossedSimmer > 0) {
            sb.append(sb.isEmpty() ? "" : " ")
              .append(crossedSimmer == 1 ? "One entered Simmering today." : crossedSimmer + " entered Simmering today.");
        }
        if (crossedWeek > 0) {
            sb.append(sb.isEmpty() ? "" : " ")
              .append(crossedWeek == 1 ? "One crossed a week today." : crossedWeek + " crossed a week today.");
        }
        return sb.toString();
    }

    private static Instant basis(Task t) {
        Instant acted = t.getLastActedAt();
        Instant captured = t.getCapturedAt();
        return acted != null && acted.isAfter(captured) ? acted : captured;
    }
}
