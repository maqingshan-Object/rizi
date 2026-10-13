package cn.rizimianmian.backend.events;

import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/events")
public class EventController {
    private final EventService service;

    public EventController(EventService service) {
        this.service = service;
    }

    @GetMapping
    public List<EventDtos.EventView> list(Authentication authentication) {
        return service.list(authentication.getName());
    }

    @PostMapping
    public EventDtos.EventView create(Authentication authentication,
                                      @Valid @RequestBody EventDtos.EventRequest request) {
        return service.create(authentication.getName(), request);
    }

    @PutMapping("/{id}")
    public EventDtos.EventView update(Authentication authentication, @PathVariable String id,
                                      @Valid @RequestBody EventDtos.EventRequest request) {
        return service.update(authentication.getName(), id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(Authentication authentication, @PathVariable String id) {
        service.delete(authentication.getName(), id);
    }

    @PostMapping("/sync")
    public List<EventDtos.EventView> sync(Authentication authentication,
                                          @Valid @RequestBody List<EventDtos.EventRequest> requests) {
        return service.sync(authentication.getName(), requests);
    }
}