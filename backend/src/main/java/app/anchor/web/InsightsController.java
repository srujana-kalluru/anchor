package app.anchor.web;

import app.anchor.service.InsightsService;
import app.anchor.web.Dtos.InsightsSummary;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/insights")
public class InsightsController {

    private final InsightsService service;

    public InsightsController(InsightsService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public InsightsSummary summary(@RequestParam(value = "weeks", defaultValue = "4") int weeks) {
        return service.summary(weeks);
    }
}
