package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.auth.UserEntity;
import cn.rizimianmian.backend.auth.UserRepository;
import cn.rizimianmian.backend.events.EventEntity;
import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import cn.rizimianmian.backend.events.EventRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖「发完之后为下一次发生日预建任务」这条线：
 * 一次性订阅发一条就消耗一次授权，不预建的话每年重复的日子第二年起就再也发不出来。
 */
class ReminderPrescheduleTest {
    private final ReminderTaskRepository tasks = mock(ReminderTaskRepository.class);
    private final EventRepository events = mock(EventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final WeChatSubscribeMessageClient wechat = mock(WeChatSubscribeMessageClient.class);
    private final ReminderTaskService service = new ReminderTaskService(
            tasks, events, users, wechat, new EventOccurrenceCalculator(), Clock.systemDefaultZone());

    private EventEntity yearlyEvent() {
        EventEntity event = mock(EventEntity.class);
        when(event.getId()).thenReturn("e1");
        when(event.isReminderEnabled()).thenReturn(true);
        when(event.getDate()).thenReturn(LocalDate.of(2026, 10, 17));
        when(event.getRepeat()).thenReturn("yearly");
        when(event.getReminderDaysBefore()).thenReturn(3);
        return event;
    }

    private ReminderTaskEntity sentTask(LocalDate occurrence) {
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", occurrence, 3);
        task.markAuthorized();
        task.markSent();
        return task;
    }

    @Test
    void 发送成功后为下一次发生日预建待授权任务() {
        ReminderTaskEntity sent = sentTask(LocalDate.of(2026, 10, 17));
        when(tasks.findById(sent.getId())).thenReturn(Optional.of(sent));
        EventEntity event = yearlyEvent();
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(event));
        when(tasks.findByEventIdAndOccurrenceAndDaysBefore("e1", LocalDate.of(2027, 10, 17), 3))
                .thenReturn(Optional.empty());
        when(tasks.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.preScheduleNextOccurrences(List.of(sent.getId()));

        ArgumentCaptor<ReminderTaskEntity> captor = ArgumentCaptor.forClass(ReminderTaskEntity.class);
        verify(tasks).save(captor.capture());
        ReminderTaskEntity created = captor.getValue();
        assertEquals(LocalDate.of(2027, 10, 17), created.getOccurrence(), "应预建明年的同一天");
        assertEquals(3, created.getDaysBefore(), "提前天数沿用事件的设置");
        assertFalse(created.isAuthorized(), "预建任务必须是待授权状态，等用户重新授权");
        assertEquals(ReminderStatus.pending, created.getStatus());
    }

    @Test
    void 下一次任务已存在时不重复创建() {
        ReminderTaskEntity sent = sentTask(LocalDate.of(2026, 10, 17));
        when(tasks.findById(sent.getId())).thenReturn(Optional.of(sent));
        EventEntity event = yearlyEvent();
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(event));
        when(tasks.findByEventIdAndOccurrenceAndDaysBefore("e1", LocalDate.of(2027, 10, 17), 3))
                .thenReturn(Optional.of(new ReminderTaskEntity("u1", "e1", LocalDate.of(2027, 10, 17), 3)));

        service.preScheduleNextOccurrences(List.of(sent.getId()));

        verify(tasks, never()).save(any());
    }

    @Test
    void 一次性事件没有下一次发生日() {
        ReminderTaskEntity sent = sentTask(LocalDate.of(2026, 10, 17));
        EventEntity once = mock(EventEntity.class);
        when(once.getId()).thenReturn("e1");
        when(once.isReminderEnabled()).thenReturn(true);
        when(once.getDate()).thenReturn(LocalDate.of(2026, 10, 17));
        when(once.getRepeat()).thenReturn("none");
        when(once.getReminderDaysBefore()).thenReturn(3);
        when(tasks.findById(sent.getId())).thenReturn(Optional.of(sent));
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(once));

        service.preScheduleNextOccurrences(List.of(sent.getId()));

        verify(tasks, never()).save(any());
    }

    @Test
    void 事件已关闭提醒时不预建() {
        ReminderTaskEntity sent = sentTask(LocalDate.of(2026, 10, 17));
        EventEntity disabled = mock(EventEntity.class);
        when(disabled.isReminderEnabled()).thenReturn(false);
        when(tasks.findById(sent.getId())).thenReturn(Optional.of(sent));
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(disabled));

        service.preScheduleNextOccurrences(List.of(sent.getId()));

        verify(tasks, never()).save(any());
    }

    @Test
    void 没有发送成功任务时不做任何事() {
        service.preScheduleNextOccurrences(List.of());
        service.preScheduleNextOccurrences(null);

        verify(tasks, never()).save(any());
    }

    @Test
    void 派发返回发送成功的任务id() {
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        task.markAuthorized();
        when(tasks.findByStatusInAndAuthorizedTrue(anyList())).thenReturn(List.of(task));
        EventEntity event = yearlyEvent();
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(event));
        UserEntity user = mock(UserEntity.class);
        when(user.getOpenId()).thenReturn("openid-1");
        when(users.findById("u1")).thenReturn(Optional.of(user));
        when(wechat.send(anyString(), any(), any())).thenReturn(WeChatSubscribeMessageClient.SendResult.sent());
        when(tasks.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<String> sent = service.dispatchDueTasks(LocalDate.of(2026, 10, 14), 3);

        assertEquals(List.of(task.getId()), sent, "发送成功的任务 id 必须回传，才能预建下一次");
        assertEquals(ReminderStatus.sent, task.getStatus());
    }

    @Test
    void 派发失败的任务不出现在返回列表里() {
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        task.markAuthorized();
        when(tasks.findByStatusInAndAuthorizedTrue(anyList())).thenReturn(List.of(task));
        EventEntity event = yearlyEvent();
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(event));
        UserEntity user = mock(UserEntity.class);
        when(user.getOpenId()).thenReturn("openid-1");
        when(users.findById("u1")).thenReturn(Optional.of(user));
        when(wechat.send(anyString(), any(), any()))
                .thenReturn(WeChatSubscribeMessageClient.SendResult.failed("模拟发送失败"));
        when(tasks.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<String> sent = service.dispatchDueTasks(LocalDate.of(2026, 10, 14), 3);

        assertTrue(sent.isEmpty());
        assertEquals(ReminderStatus.failed, task.getStatus());
    }

    @Test
    void 到期日已过但在补发窗口内仍会尝试发送() {
        // 发生日 2026-10-17、提前 3 天 ⇒ 到期日 2026-10-14；今天是 10-16（到期日已过 2 天）
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        task.markAuthorized();
        when(tasks.findByStatusInAndAuthorizedTrue(anyList())).thenReturn(List.of(task));
        EventEntity event = yearlyEvent();
        when(events.findByIdAndUserId("e1", "u1")).thenReturn(Optional.of(event));
        UserEntity user = mock(UserEntity.class);
        when(user.getOpenId()).thenReturn("openid-1");
        when(users.findById("u1")).thenReturn(Optional.of(user));
        when(wechat.send(anyString(), any(), any())).thenReturn(WeChatSubscribeMessageClient.SendResult.sent());
        when(tasks.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<String> sent = service.dispatchDueTasks(LocalDate.of(2026, 10, 16), 3);

        assertEquals(List.of(task.getId()), sent, "窗口内的过期任务应该被补发");
    }

    @Test
    void 超出补发窗口的任务不再发送() {
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        task.markAuthorized();
        when(tasks.findByStatusInAndAuthorizedTrue(anyList())).thenReturn(List.of(task));

        // 到期日 10-14，今天 10-20 ⇒ 超出 3 天窗口
        List<String> sent = service.dispatchDueTasks(LocalDate.of(2026, 10, 20), 3);

        assertTrue(sent.isEmpty(), "过期太久不该突然补发");
    }

    @Test
    void 宽限为零时等同旧的精确当天匹配() {
        ReminderTaskEntity task = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        task.markAuthorized();
        when(tasks.findByStatusInAndAuthorizedTrue(anyList())).thenReturn(List.of(task));

        assertTrue(service.dispatchDueTasks(LocalDate.of(2026, 10, 16), 0).isEmpty(), "宽限 0：提前一天不发");
    }

    @Test
    void 重新授权可以救回已失败的任务() {
        ReminderTaskEntity failed = new ReminderTaskEntity("u1", "e1", LocalDate.of(2026, 10, 17), 3);
        failed.markAuthorized();
        failed.markFailed("微信订阅消息发送失败：system error");
        assertEquals(ReminderStatus.failed, failed.getStatus());

        when(tasks.findByIdAndUserId(failed.getId(), "u1")).thenReturn(Optional.of(failed));
        when(tasks.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ReminderDtos.ReminderView> authorized = service.authorize("u1",
                new ReminderDtos.TaskIdsRequest(List.of(failed.getId())));

        assertEquals(1, authorized.size(), "失败任务必须能被重新授权激活（否则永远卡在失败状态）");
        assertEquals(ReminderStatus.pending, failed.getStatus());
        assertTrue(failed.isAuthorized());
        assertNull(failed.getLastError(), "重新授权后失败原因应清空");
    }
}
