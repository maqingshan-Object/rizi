package cn.rizimianmian.backend.pay;

/** 权益类型：已购主题 / 自用胶囊额度 / 送人胶囊额度 / 赞赏（赞赏不产生权益，仅留记录）。 */
public enum EntitlementType {
    theme,
    /** 自用胶囊额度（能自己写）。 */
    capsule,
    /** 送人胶囊额度（只能送人 —— 受赠得来的就是这种）。 */
    capsule_gift,
    support
}
