package com.japanflow.mobile;

import android.content.Context;
import android.util.Base64;

import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;

public final class JapanFlowOtaSecurity {

    private JapanFlowOtaSecurity() {}

    private static PublicKey loadTrustedKey(
        Context context
    ) throws Exception {
        try (
            InputStream input = context.getResources()
                .openRawResource(
                    R.raw.japanflow_ota_public_key
                );
            ByteArrayOutputStream output =
                new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[1024];
            int length;

            while ((length = input.read(buffer)) != -1) {
                output.write(buffer, 0, length);
            }

            String encoded = new String(
                output.toByteArray(),
                StandardCharsets.US_ASCII
            ).trim();

            byte[] key = Base64.decode(
                encoded,
                Base64.DEFAULT
            );

            return KeyFactory
                .getInstance("EC")
                .generatePublic(
                    new X509EncodedKeySpec(key)
                );
        }
    }

    static byte[] p1363ToDer(byte[] raw)
        throws Exception {

        if (raw == null || raw.length != 64) {
            throw new IllegalArgumentException(
                "Invalid ECDSA signature length"
            );
        }

        byte[] r = new BigInteger(
            1,
            Arrays.copyOfRange(raw, 0, 32)
        ).toByteArray();

        byte[] s = new BigInteger(
            1,
            Arrays.copyOfRange(raw, 32, 64)
        ).toByteArray();

        ByteArrayOutputStream der =
            new ByteArrayOutputStream();

        der.write(0x30);
        der.write(4 + r.length + s.length);

        der.write(0x02);
        der.write(r.length);
        der.write(r);

        der.write(0x02);
        der.write(s.length);
        der.write(s);

        return der.toByteArray();
    }

    public static boolean verify(
        Context context,
        String payload,
        String signature
    ) {
        if (
            payload == null ||
            payload.isEmpty() ||
            payload.length() > 100000 ||
            signature == null ||
            signature.length() > 128
        ) {
            return false;
        }

        try {
            byte[] rawSignature = Base64.decode(
                signature,
                Base64.DEFAULT
            );

            Signature verifier =
                Signature.getInstance("SHA256withECDSA");

            verifier.initVerify(
                loadTrustedKey(context)
            );

            verifier.update(
                payload.getBytes(
                    StandardCharsets.UTF_8
                )
            );

            return verifier.verify(
                p1363ToDer(rawSignature)
            );
        } catch (Exception error) {
            return false;
        }
    }
}
