package cn.rizimianmian.backend.pay;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;

/**
 * 小程序虚拟支付的双签名。
 *
 * <pre>
 * paySig    = hex(hmacSha256(AppKey,      "requestVirtualPayment" + "&" + signData))
 * signature = hex(hmacSha256(sessionKey,  signData))
 * </pre>
 *
 * <p>两把密钥、两个用途，算错哪一个都会报签名失败：
 * <ul>
 *   <li><b>AppKey</b> 来自后台「虚拟支付 → 基础配置」，按 env 选现网或沙箱，<b>绝不能下发到前端</b>；</li>
 *   <li><b>sessionKey</b> 来自 code2Session，同样只留在服务端。</li>
 * </ul>
 */
public final class VirtualPaySigner {
    /** 基础库调用的固定 uri（服务端 API 则填接口路径，且不带 query）。 */
    public static final String PAY_URI = "requestVirtualPayment";

    private VirtualPaySigner() {
    }

    public static String hmacSha256Hex(String key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b & 0xff));
            }
            return builder.toString();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("计算虚拟支付签名失败：" + exception.getMessage(), exception);
        }
    }

    public static String paySig(String appKey, String signData) {
        return hmacSha256Hex(appKey, PAY_URI + "&" + signData);
    }

    public static String signature(String sessionKey, String signData) {
        return hmacSha256Hex(sessionKey, signData);
    }

    /**
     * 消息推送（含虚拟支付发货回调）的地址校验签名。
     *
     * <pre>signature = sha1( 把 token、timestamp、nonce 三个字符串按字典序排序后拼接 )</pre>
     *
     * 微信在保存推送地址时会先发一个 GET 请求带 echostr 过来，服务器要原样回显 echostr；
     * 这里先校验签名，通过才回显。密钥用后台「消息推送」里填的 Token。
     */
    public static String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b & 0xff));
            }
            return builder.toString();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("计算校验签名失败：" + exception.getMessage(), exception);
        }
    }

    public static boolean matchesWechatSignature(String token, String signature, String timestamp, String nonce) {
        if (token == null || token.isBlank() || signature == null || signature.isBlank()) {
            return false;
        }
        String[] parts = { token, timestamp == null ? "" : timestamp, nonce == null ? "" : nonce };
        java.util.Arrays.sort(parts);
        return sha1Hex(String.join("", parts)).equalsIgnoreCase(signature);
    }
}
