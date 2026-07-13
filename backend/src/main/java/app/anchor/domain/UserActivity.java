package app.anchor.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "user_activity")
@IdClass(UserActivity.Key.class)
@Getter
@Setter
public class UserActivity {
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "activity_date")
    private LocalDate activityDate;

    @Getter
    @Setter
    public static class Key implements Serializable {
        private UUID userId;
        private LocalDate activityDate;

        public Key() {}

        public Key(UUID userId, LocalDate activityDate) {
            this.userId = userId;
            this.activityDate = activityDate;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key key)) return false;
            return userId.equals(key.userId) && activityDate.equals(key.activityDate);
        }

        @Override
        public int hashCode() {
            return userId.hashCode() * 31 + activityDate.hashCode();
        }
    }
}
