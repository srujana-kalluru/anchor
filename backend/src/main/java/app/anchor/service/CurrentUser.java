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
                    insert into users (id, email, display_name, starter_offered_at) values (:id, :email, :name, now())
                    on conflict (id) do nothing
                    """)
                .setParameter("id", id)
                .setParameter("email", jwt.getClaimAsString("email"))
                .setParameter("name", displayNameFrom(jwt))
                .executeUpdate();
            seedDefaults(id);
            return users.findById(id).orElseThrow();
        });
    }

    /**
     * Every new account starts with a small set of sources and one break idea per course,
     * so the Source field and the Dopamine Menu are useful from the first task. Seeding
     * happens here (idempotently) instead of via a client-side prompt, which had let a user
     * re-add items they already owned and create duplicates.
     */
    private void seedDefaults(UUID uid) {
        em.createNativeQuery("""
                insert into sources (id, user_id, name)
                select gen_random_uuid(), :uid, s.name
                from (values ('Email'),('In Person'),('Slack'),('Phone'),('WhatsApp')) as s(name)
                where not exists (
                  select 1 from sources x where x.user_id = :uid and lower(x.name) = lower(s.name) and x.deleted_at is null)
                """).setParameter("uid", uid).executeUpdate();
        em.createNativeQuery("""
                insert into dopamine_menu_items (id, user_id, course, label, duration_minutes, sort_order)
                select gen_random_uuid(), :uid, m.course, m.label, m.mins, 0
                from (values
                  ('appetiser','Step outside',3),
                  ('side','Instrumental playlist',null::int),
                  ('entree','Short walk outside',15),
                  ('dessert','Social media',10),
                  ('special','Gym session',null::int)
                ) as m(course,label,mins)
                where not exists (
                  select 1 from dopamine_menu_items x where x.user_id = :uid and x.course = m.course and x.deleted_at is null)
                """).setParameter("uid", uid).executeUpdate();
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
