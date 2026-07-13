package app.anchor.web;

import app.anchor.domain.Category;
import app.anchor.domain.Requestor;
import app.anchor.domain.Source;
import app.anchor.repo.Repos;
import app.anchor.service.CurrentUser;
import app.anchor.web.ApiErrors.NotFoundException;
import app.anchor.web.Dtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class ListsController {

    private final Repos.Categories categories;
    private final Repos.Sources sources;
    private final Repos.Requestors requestors;
    private final CurrentUser currentUser;

    public ListsController(Repos.Categories categories, Repos.Sources sources, Repos.Requestors requestors,
                           CurrentUser currentUser) {
        this.categories = categories;
        this.sources = sources;
        this.requestors = requestors;
        this.currentUser = currentUser;
    }

    @GetMapping("/categories")
    public List<CategoryDto> listCategories() {
        return categories.findByUserIdAndDeletedAtIsNullOrderByName(currentUser.id())
            .stream().map(CategoryDto::of).toList();
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public CategoryDto createCategory(@RequestBody UpsertCategory req) {
        UUID uid = currentUser.get().getId();
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        return categories.findByIdAndUserId(id, uid).map(CategoryDto::of).orElseGet(() -> {
            Category c = new Category();
            c.setId(id);
            c.setUserId(uid);
            c.setName(req.name().trim());
            if (req.colourHex() != null) c.setColourHex(req.colourHex());
            return CategoryDto.of(categories.save(c));
        });
    }

    @PatchMapping("/categories/{id}")
    @Transactional
    public CategoryDto patchCategory(@PathVariable UUID id, @RequestBody Map<String, String> req) {
        Category c = categories.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("category not found"));
        if (req.containsKey("name")) c.setName(req.get("name").trim());
        if (req.containsKey("colourHex")) c.setColourHex(req.get("colourHex"));
        return CategoryDto.of(categories.save(c));
    }

    @DeleteMapping("/categories/{id}")
    @Transactional
    public Ok deleteCategory(@PathVariable UUID id) {
        Category c = categories.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("category not found"));
        c.setDeletedAt(Instant.now());
        categories.save(c);
        return Ok.OK;
    }

    @GetMapping("/sources")
    public List<SourceDto> listSources() {
        return sources.findByUserIdAndDeletedAtIsNullOrderByCreatedAt(currentUser.id())
            .stream().map(SourceDto::of).toList();
    }

    @PostMapping("/sources")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public SourceDto createSource(@RequestBody UpsertSource req) {
        UUID uid = currentUser.get().getId();
        UUID id = req.id() != null ? req.id() : UUID.randomUUID();
        return sources.findByIdAndUserId(id, uid).map(SourceDto::of).orElseGet(() -> {
            Source s = new Source();
            s.setId(id);
            s.setUserId(uid);
            s.setName(req.name().trim());
            return SourceDto.of(sources.save(s));
        });
    }

    @PatchMapping("/sources/{id}")
    @Transactional
    public SourceDto patchSource(@PathVariable UUID id, @RequestBody Map<String, String> req) {
        Source s = sources.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("source not found"));
        if (req.containsKey("name")) s.setName(req.get("name").trim());
        return SourceDto.of(sources.save(s));
    }

    @DeleteMapping("/sources/{id}")
    @Transactional
    public Ok deleteSource(@PathVariable UUID id) {
        Source s = sources.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("source not found"));
        s.setDeletedAt(Instant.now());
        sources.save(s);
        return Ok.OK;
    }

    @GetMapping("/requestors")
    public List<RequestorDto> listRequestors() {
        return requestors.findByUserIdAndDeletedAtIsNullOrderByUseCountDesc(currentUser.id())
            .stream().map(RequestorDto::of).toList();
    }

    @PatchMapping("/requestors/{id}")
    @Transactional
    public RequestorDto patchRequestor(@PathVariable UUID id, @RequestBody Map<String, String> req) {
        Requestor r = requestors.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("requestor not found"));
        if (req.containsKey("name")) r.setName(req.get("name").trim());
        return RequestorDto.of(requestors.save(r));
    }

    @DeleteMapping("/requestors/{id}")
    @Transactional
    public Ok deleteRequestor(@PathVariable UUID id) {
        Requestor r = requestors.findByIdAndUserId(id, currentUser.id())
            .orElseThrow(() -> new NotFoundException("requestor not found"));
        r.setDeletedAt(Instant.now());
        requestors.save(r);
        return Ok.OK;
    }
}
