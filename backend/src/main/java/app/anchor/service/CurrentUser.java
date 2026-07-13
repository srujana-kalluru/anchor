package app.anchor.service;

import app.anchor.domain.UserAccount;
import app.anchor.repo.Repos;
import jakarta.persistence.EntityManager;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Users exist in Supabase Auth; rows here are provisioned lazily from the verified JWT
 * so the first authenticated request from a new Google account just works. The insert is a
 * race-safe upsert because two devices can make their first call in the same instant.
 */
@Service
public class CurrentUser {

    private final Repos.Users users;
    private final EntityManager em;

    public CurrentUser(Repos.Users users, EntityManager em) {
        this.users = users;
        this.em = em;
    }

    public UUID id() {
        return UUID.fromString(jwt().getSubject());
    }

    @Transactional
    public UserAccount get() {
        Jwt jwt = jwt();
        UUID id = UUID.fromString(jwt.getSubject());
        return users.findById(id).orElseGet(() -> {
            em.createNativeQuery("""
                    insert into users (id, email, display_name) values (:id, :email, :name)
                    on conflict (id) do nothing
                    """)
                .setParameter("id", id)
                .setParameter("email", jwt.getClaimAsString("email"))
                .setParameter("name", displayNameFrom(jwt))
                .executeUpdate();
            return users.findById(id).orElseThrow();
        });
    }

    private Jwt jwt() {
        return (Jwt) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    private String displayNameFrom(Jwt jwt) {
        Map<String, Object> meta = jwt.getClaimAsMap("user_metadata");
        if (meta != null) {
            Object name = meta.getOrDefault("full_name", meta.get("name"));
            if (name instanceof String s && !s.isBlank()) {
                return s.split(" ")[0];
            }
        }
        String email = jwt.getClaimAsString("email");
        return email != null ? email.split("@")[0] : "there";
    }
}
