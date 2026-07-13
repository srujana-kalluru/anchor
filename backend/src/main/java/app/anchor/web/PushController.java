package app.anchor.web;

import app.anchor.domain.PushSubscription;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/push/subscriptions")
public class PushController {

    private final Repos.Push push;
    private final CurrentUser currentUser;

    public PushController(Repos.Push push, CurrentUser currentUser) {
        this.push = push;
        this.currentUser = currentUser;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public PushSubscriptionDto subscribe(@RequestBody PushSubscribe req) {
        UUID uid = currentUser.get().getId();
        PushSubscription sub = push.findByEndpoint(req.endpoint()).orElseGet(PushSubscription::new);
        if (sub.getId() == null) {
            sub.setId(req.id() != null ? req.id() : UUID.randomUUID());
        }
        sub.setUserId(uid);
        sub.setEndpoint(req.endpoint());
        sub.setP256dh(req.p256dh());
        sub.setAuth(req.auth());
        PushSubscription saved = push.save(sub);
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
