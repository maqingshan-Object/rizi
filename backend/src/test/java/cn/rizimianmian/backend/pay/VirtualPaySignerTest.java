package cn.rizimianmian.backend.pay;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VirtualPaySignerTest {

    @Test
    void hmacSha256UsesLowerCaseHex() {
        // RFC 4231 的经典测试向量：key="key", message="The quick brown fox jumps over the lazy dog"
        assertEquals("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
                VirtualPaySigner.hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"));
    }

    @Test
    void paySigPrefixesTheFixedUri() {
        String signData = "{\"offerId\":\"123\",\"buyQuantity\":1}";
        assertEquals(VirtualPaySigner.hmacSha256Hex("app-key", "requestVirtualPayment&" + signData),
                VirtualPaySigner.paySig("app-key", signData));
    }

    @Test
    void signatureUsesSessionKeyDirectly() {
        String signData = "{\"offerId\":\"123\"}";
        assertEquals(VirtualPaySigner.hmacSha256Hex("session-key", signData),
                VirtualPaySigner.signature("session-key", signData));
        // 两把密钥不同 → 两个签名必须不同（这是最容易搞混的地方）
        assertFalse(VirtualPaySigner.paySig("app-key", signData)
                .equals(VirtualPaySigner.signature("app-key", signData)));
    }

    @Test
    void configuredOnlyWhenOfferIdAndAppKeyPresent() {
        assertFalse(new cn.rizimianmian.backend.config.AppProperties.VirtualPay("", "", "", 0, null, null).configured());
        assertFalse(new cn.rizimianmian.backend.config.AppProperties.VirtualPay("123", "", "", 0, null, null).configured());
        assertTrue(new cn.rizimianmian.backend.config.AppProperties.VirtualPay("123", "key", "", 0, null, null).configured());
        // env=1 时用沙箱 key，此时现网 key 为空也应算"已配置"
        assertTrue(new cn.rizimianmian.backend.config.AppProperties.VirtualPay("123", "", "sandbox", 1, null, null).configured());
    }

    @Test
    void sha1MatchesKnownVector() {
        // 标准测试向量：sha1("abc")
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", VirtualPaySigner.sha1Hex("abc"));
    }

    @Test
    void notifyAddressVerificationSortsTokenTimestampNonce() {
        String token = "daysToken";
        String timestamp = "1666000000";
        String nonce = "abc123";
        String[] parts = { token, timestamp, nonce };
        java.util.Arrays.sort(parts);
        String good = VirtualPaySigner.sha1Hex(String.join("", parts));

        assertTrue(VirtualPaySigner.matchesWechatSignature(token, good, timestamp, nonce), "签名正确时应当通过");
        assertFalse(VirtualPaySigner.matchesWechatSignature(token, "deadbeef", timestamp, nonce), "签名不对必须拒绝");
        assertFalse(VirtualPaySigner.matchesWechatSignature("", good, timestamp, nonce), "没配 Token 时必须拒绝");
        assertFalse(VirtualPaySigner.matchesWechatSignature(token, null, timestamp, nonce), "缺 signature 必须拒绝");
    }
}
