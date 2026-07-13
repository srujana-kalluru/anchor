package app.anchor.service;

import app.anchor.domain.PushSubscription;
import app.anchor.repo.Repos;
import app.anchor.web.Dtos;
import com.fasterxml.jackson.databind.ObjectMapper;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.Security;
import java.util.List;

@Service
public class PushSender {

    private static final Logger log = LoggerFactory.getLogger(PushSender.class);

    private final Repos.Push pushRepo;
    private final ObjectMapper mapper;
    private final PushService pushService;
    private final boolean configured;

    public PushSender(Repos.Push pushRepo, ObjectMapper mapper,
                      @Value("${anchor.vapid.public-key}") String publicKey,
                      @Value("${anchor.vapid.private-key}") String privateKey,
                      @Value("${anchor.vapid.subject}") String subject) throws Exception {
        this.pushRepo = pushRepo;
        this.mapper = mapper;
        this.configured = publicKey != null && !publicKey.isBlank();
        if (configured) {
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }
            this.pushService = new PushService(publicKey, privateKey, subject);
        } else {
            this.pushService = null;
            log.warn("VAPID keys not configured; Ageing Digest sends are disabled");
        }
    }

    public void sendToUser(java.util.UUID userId, String body, String url) {
        if (!configured) return;
        List<PushSubscription> subs = pushRepo.findByUserId(userId);
        for (PushSubscription sub : subs) {
            try {
                byte[] payload = mapper.writeValueAsBytes(Dtos.ngswPayload(body, url));
                Notification n = new Notification(sub.getEndpoint(), sub.getP256dh(), sub.getAuth(), payload);
                var response = pushService.send(n);
                int status = response.getStatusLine().getStatusCode();
                if (status == 404 || status == 410) {
                    // The push relay reports this subscription dead; per PRD 6.3 it is deleted server-side.
                    pushRepo.delete(sub);
                } else if (status >= 400) {
                    log.warn("push send failed with status {} for user {}", status, userId);
                }
            } catch (Exception e) {
                log.warn("push send error for user {}: {}", userId, e.getMessage());
            }
        }
    }
}
