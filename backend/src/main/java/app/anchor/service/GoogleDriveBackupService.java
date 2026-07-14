package app.anchor.service;

import app.anchor.domain.UserAccount;
import app.anchor.repo.Repos;
import app.anchor.web.Dtos;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Server-side Google Drive backups. The server holds the user's Google refresh token,
 * so backups run on schedule with no browser involvement after the single consent.
 */
@Service
public class GoogleDriveBackupService {

    private static final Logger log = LoggerFactory.getLogger(GoogleDriveBackupService.class);
    private static final String FOLDER_NAME = "Anchor Backups";
    private static final String FOLDER_MIME = "application/vnd.google-apps.folder";

    private final Repos.Users users;
    private final Repos.Tasks tasks;
    private final Repos.Steps steps;
    private final Repos.Categories categories;
    private final Repos.Sources sources;
    private final Repos.Requestors requestors;
    private final Repos.Menu menu;
    private final Repos.Sessions sessions;
    private final TaskService taskService;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    private final String clientId;
    private final String clientSecret;

    public GoogleDriveBackupService(Repos.Users users, Repos.Tasks tasks, Repos.Steps steps,
                                    Repos.Categories categories, Repos.Sources sources,
                                    Repos.Requestors requestors, Repos.Menu menu, Repos.Sessions sessions,
                                    TaskService taskService, ObjectMapper mapper,
                                    @Value("${anchor.google.client-id}") String clientId,
                                    @Value("${anchor.google.client-secret}") String clientSecret) {
        this.users = users;
        this.tasks = tasks;
        this.steps = steps;
        this.categories = categories;
        this.sources = sources;
        this.requestors = requestors;
        this.menu = menu;
        this.sessions = sessions;
        this.taskService = taskService;
        this.mapper = mapper;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    public boolean configured() {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }

    @Scheduled(cron = "0 20 * * * *")
    @Transactional
    public void scheduledRun() {
        if (!configured()) return;
        for (UserAccount user : users.findByDriveBackupEnabledTrue()) {
            Instant last = user.getLastDriveBackupAt();
            if (user.getGoogleRefreshToken() == null) continue;
            if (last != null && last.isAfter(Instant.now().minus(Duration.ofHours(20)))) continue;
            try {
                backup(user);
            } catch (Exception e) {
                log.warn("scheduled drive backup failed for {}: {}", user.getId(), e.getMessage());
            }
        }
    }

    @Transactional
    public void backup(UserAccount user) throws IOException, InterruptedException {
        String accessToken = exchange(user);
        if (accessToken == null) return;
        Instant epoch = Instant.EPOCH;
        var uid = user.getId();
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("app", "anchor");
        export.put("exportedAt", Instant.now().toString());
        export.put("account", user.getEmail());
        export.put("tasks", taskService.toDtos(tasks.findByUserIdAndUpdatedAtAfter(uid, epoch)));
        export.put("steps", steps.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.StepDto::of).toList());
        export.put("categories", categories.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.CategoryDto::of).toList());
        export.put("sources", sources.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.SourceDto::of).toList());
        export.put("requestors", requestors.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.RequestorDto::of).toList());
        export.put("menuItems", menu.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.MenuItemDto::of).toList());
        export.put("focusSessions", sessions.findByUserIdAndUpdatedAtAfter(uid, epoch).stream().map(Dtos.SessionDto::of).toList());
        String body = mapper.writeValueAsString(export);

        String folderId = ensureFolder(accessToken);
        String name = "anchor-backup-" + LocalDate.now() + ".json";
        String existing = findFile(accessToken, folderId, name);
        upload(accessToken, folderId, name, body, existing);

        user.setLastDriveBackupAt(Instant.now());
        users.save(user);
    }

    /** Exchanges the stored refresh token; a revoked grant disables backup rather than erroring forever. */
    private String exchange(UserAccount user) throws IOException, InterruptedException {
        String form = "client_id=" + enc(clientId) + "&client_secret=" + enc(clientSecret)
            + "&refresh_token=" + enc(user.getGoogleRefreshToken()) + "&grant_type=refresh_token";
        HttpResponse<String> res = http.send(HttpRequest.newBuilder()
                .uri(URI.create("https://oauth2.googleapis.com/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form)).build(),
            HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            if (res.body() != null && res.body().contains("invalid_grant")) {
                log.warn("drive grant revoked for {}; disabling backup", user.getId());
                user.setGoogleRefreshToken(null);
                user.setDriveBackupEnabled(false);
                users.save(user);
                return null;
            }
            throw new IOException("token exchange failed: " + res.statusCode());
        }
        return mapper.readTree(res.body()).path("access_token").asText();
    }

    private String ensureFolder(String token) throws IOException, InterruptedException {
        String q = enc("name='" + FOLDER_NAME + "' and mimeType='" + FOLDER_MIME + "' and trashed=false");
        JsonNode found = driveGet(token, "https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" + q);
        if (found.path("files").size() > 0) {
            return found.path("files").get(0).path("id").asText();
        }
        HttpResponse<String> res = http.send(HttpRequest.newBuilder()
                .uri(URI.create("https://www.googleapis.com/drive/v3/files"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                    "{\"name\":\"" + FOLDER_NAME + "\",\"mimeType\":\"" + FOLDER_MIME + "\"}")).build(),
            HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) throw new IOException("folder create failed: " + res.statusCode());
        return mapper.readTree(res.body()).path("id").asText();
    }

    private String findFile(String token, String folderId, String name) throws IOException, InterruptedException {
        String q = enc("name='" + name + "' and '" + folderId + "' in parents and trashed=false");
        JsonNode found = driveGet(token, "https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" + q);
        return found.path("files").size() > 0 ? found.path("files").get(0).path("id").asText() : null;
    }

    private void upload(String token, String folderId, String name, String content, String existingId)
        throws IOException, InterruptedException {
        HttpRequest req;
        if (existingId != null) {
            req = HttpRequest.newBuilder()
                .uri(URI.create("https://www.googleapis.com/upload/drive/v3/files/" + existingId + "?uploadType=media"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(content, StandardCharsets.UTF_8)).build();
        } else {
            String boundary = "anchor-" + System.nanoTime();
            String meta = "{\"name\":\"" + name + "\",\"parents\":[\"" + folderId + "\"]}";
            String multipart = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta
                + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" + content
                + "\r\n--" + boundary + "--";
            req = HttpRequest.newBuilder()
                .uri(URI.create("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "multipart/related; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(multipart, StandardCharsets.UTF_8)).build();
        }
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) throw new IOException("drive upload failed: " + res.statusCode());
    }

    private JsonNode driveGet(String token, String url) throws IOException, InterruptedException {
        HttpResponse<String> res = http.send(HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .GET().build(),
            HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) throw new IOException("drive query failed: " + res.statusCode());
        return mapper.readTree(res.body());
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
