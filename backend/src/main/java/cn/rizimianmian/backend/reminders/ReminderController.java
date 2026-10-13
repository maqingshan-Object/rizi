package cn.rizimianmian.backend.reminders;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/reminders")
public class ReminderController {
    private final ReminderTaskService service;

    public ReminderController(ReminderTaskService service) {
        this.service = service;
    }

    @GetMapping
    public List<ReminderDtos.ReminderView> list(Authentication authentication) {
        return service.list(authentication.getName());
    }

    @PostMapping("/authorize")
    public List<ReminderDtos.ReminderView> authorize(Authentication authentication,
                                                      @RequestBody(required = false) ReminderDtos.TaskIdsRequest request) {
        return service.authorize(authentication.getName(), request);
    }

    @PostMapping("/retry")
    public List<ReminderDtos.ReminderView> retry(Authentication authentication,
                                                  @RequestBody(required = false) ReminderDtos.TaskIdsRequest request) {
        return service.retry(authentication.getName(), request);
    }
}
