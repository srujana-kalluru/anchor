package app.anchor.web;

import app.anchor.domain.PushSubscription;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos.*;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/push/subscriptions")
public class PushController {

    private final Repos.Push push;
    private final CurrentUser currentUser;
    private final EntityManager em;

    public PushController(Repos.Push push, CurrentUser currentUser, EntityManager em) {
        this.push = push;
        this.currentUser = currentUser;
        this.em = em;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public PushSubscriptionDto subscribe(@RequestBody PushSubscribe req) {
        UUID uid = currentUser.get().getId();
        // A cold-start retry can race the original request past a find-then-save check and trip
        // the unique endpoint constraint, so the upsert happens atomically in the database.
        em.createNativeQuery("""
                insert into push_subscriptions (id, user_id, endpoint, p256dh, auth)
                values (:id, :uid, :endpoint, :p256dh, :auth)
                on conflict (endpoint) do update
                    set user_id = excluded.user_id,
                        p256dh = excluded.p256dh,
                        auth = excluded.auth,
                        updated_at = now()
                """)
            .setParameter("id", req.id() != null ? req.id() : UUID.randomUUID())
            .setParameter("uid", uid)
            .setParameter("endpoint", req.endpoint())
            .setParameter("p256dh", req.p256dh())
            .setParameter("auth", req.auth())
            .executeUpdate();
        PushSubscription saved = push.findByEndpoint(req.endpoint()).orElseThrow();
        return new PushSubscriptionDto(saved.getId(), saved.getEndpoint());
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Ok unsubscribe(@PathVariable UUID id) {
        PushSubscription sub = push.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("subscription not found"));
        push.delete(sub);
        return Ok.OK;
    }
}
