// JapanFlow: reproducible patch of the audited Capgo 8.54.2 Java source.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '../node_modules/@capgo/capacitor-updater');
const version = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).version;
if (version !== '8.54.2') throw new Error('Unexpected Capgo version: ' + version);
const dir = path.join(base, 'android/src/main/java/ee/forgr/capacitor_updater');
const file = path.join(dir, 'CapacitorUpdaterPlugin.java');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const original = '15ce24c8c7cc043bbe8ee1aada272d8d0c7ac44c09e75bb60b23bd14e5f94f6b';
const patched = '243a5dbb88d042c1fde8fe55cdcb8e595257f2977298527e4c2956778f12dd31';
const edits = [
  [
    'public void next(final PluginCall call) {',
    'public void next(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void reload(final PluginCall call) {',
    'public void reload(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void reset(final PluginCall call) {',
    'public void reset(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void startPreviewSession(final PluginCall call) {',
    'public void startPreviewSession(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setPreview(final PluginCall call) {',
    'public void setPreview(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void resetPreview(final PluginCall call) {',
    'public void resetPreview(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void deletePreview(final PluginCall call) {',
    'public void deletePreview(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void updatePreview(final PluginCall call) {',
    'public void updatePreview(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void triggerUpdateCheck(final PluginCall call) {',
    'public void triggerUpdateCheck(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setChannel(final PluginCall call) {',
    'public void setChannel(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void unsetChannel(final PluginCall call) {',
    'public void unsetChannel(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setUpdateUrl(final PluginCall call) {',
    'public void setUpdateUrl(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setStatsUrl(final PluginCall call) {',
    'public void setStatsUrl(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setChannelUrl(final PluginCall call) {',
    'public void setChannelUrl(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setShakeMenu(final PluginCall call) {',
    'public void setShakeMenu(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setShakeChannelSelector(final PluginCall call) {',
    'public void setShakeChannelSelector(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setAppId(final PluginCall call) {',
    'public void setAppId(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void delete(final PluginCall call) {',
    'public void delete(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setBundleError(final PluginCall call) {',
    'public void setBundleError(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void setMultiDelay(final PluginCall call) {',
    'public void setMultiDelay(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void cancelDelay(final PluginCall call) {',
    'public void cancelDelay(final PluginCall call) {\n        if ("com.japanflow.mobile".equals(getContext().getPackageName())) {\n            call.reject("JapanFlow pilot: operation disabled");\n            return;\n        }',
    1,
  ],
  [
    'public void download(final PluginCall call) {',
    'public void download(final PluginCall call) {\n        if (!JapanFlowPilotGate.authorizeDownload(getContext(), call)) {\n            call.reject("JapanFlow pilot: download not authorized");\n            return;\n        }',
    1,
  ],
  [
    'logger.info("Setting active bundle " + id);',
    'if (!JapanFlowPilotGate.reserve(getContext(), call, this.implementation.getBundleInfo(id), this.implementation.getCurrentBundle())) {\n                    call.reject("JapanFlow pilot: activation not authorized");\n                    return;\n                }\n                logger.info("Setting active bundle " + id);',
    1,
  ],
  [
    'this.implementation.setSuccess(bundle, this.autoDeletePrevious);',
    'this.implementation.setSuccess(bundle, this.autoDeletePrevious);\n            if (!JapanFlowPilotGate.reconcile(getContext(), bundle)) {\n                call.reject("JapanFlow pilot: native sequence reconciliation failed");\n                return;\n            }',
    1,
  ],
  [
    'logger.info("Downloading " + url);',
    'logger.info("Downloading authorized JapanFlow bundle");',
    1,
  ],
  [
    'public void set(final PluginCall call) {\n        final String id = call.getString("id");',
    'public void set(final PluginCall call) {\n        final String id = call.getString("id");\n        if (id == null || !id.matches("[A-Za-z0-9_-]{1,128}")) {\n            call.reject("JapanFlow pilot: invalid bundle ID");\n            return;\n        }',
    1,
  ],
];
let target = source;
if (sha(source) === original) {
  for (const [before, after, count] of edits) {
    if (target.split(before).length - 1 !== count) throw new Error('Unexpected Capgo patch anchor');
    target = target.split(before).join(after);
  }
}
const helpers = {
  'JapanFlowOtaSecurity.java':
    'package ee.forgr.capacitor_updater;\n\nimport android.content.Context;\nimport android.util.Base64;\n\nimport java.io.InputStream;\nimport java.io.ByteArrayOutputStream;\nimport java.math.BigInteger;\nimport java.nio.charset.StandardCharsets;\nimport java.security.KeyFactory;\nimport java.security.PublicKey;\nimport java.security.Signature;\nimport java.security.spec.X509EncodedKeySpec;\nimport java.util.Arrays;\n\npublic final class JapanFlowOtaSecurity {\n\n    private JapanFlowOtaSecurity() {}\n\n    private static PublicKey loadTrustedKey(\n        Context context\n    ) throws Exception {\n        try (\n            InputStream input = context.getResources()\n                .openRawResource(\n                    context.getResources().getIdentifier("japanflow_ota_public_key", "raw", context.getPackageName())\n                );\n            ByteArrayOutputStream output =\n                new ByteArrayOutputStream()\n        ) {\n            byte[] buffer = new byte[1024];\n            int length;\n\n            while ((length = input.read(buffer)) != -1) {\n                output.write(buffer, 0, length);\n            }\n\n            String encoded = new String(\n                output.toByteArray(),\n                StandardCharsets.US_ASCII\n            ).trim();\n\n            byte[] key = Base64.decode(\n                encoded,\n                Base64.DEFAULT\n            );\n\n            return KeyFactory\n                .getInstance("EC")\n                .generatePublic(\n                    new X509EncodedKeySpec(key)\n                );\n        }\n    }\n\n    static byte[] p1363ToDer(byte[] raw)\n        throws Exception {\n\n        if (raw == null || raw.length != 64) {\n            throw new IllegalArgumentException(\n                "Invalid ECDSA signature length"\n            );\n        }\n\n        byte[] r = new BigInteger(\n            1,\n            Arrays.copyOfRange(raw, 0, 32)\n        ).toByteArray();\n\n        byte[] s = new BigInteger(\n            1,\n            Arrays.copyOfRange(raw, 32, 64)\n        ).toByteArray();\n\n        ByteArrayOutputStream der =\n            new ByteArrayOutputStream();\n\n        der.write(0x30);\n        der.write(4 + r.length + s.length);\n\n        der.write(0x02);\n        der.write(r.length);\n        der.write(r);\n\n        der.write(0x02);\n        der.write(s.length);\n        der.write(s);\n\n        return der.toByteArray();\n    }\n\n    public static boolean verify(\n        Context context,\n        String payload,\n        String signature\n    ) {\n        if (\n            payload == null ||\n            payload.isEmpty() ||\n            payload.length() > 100000 ||\n            signature == null ||\n            signature.length() > 128\n        ) {\n            return false;\n        }\n\n        try {\n            byte[] rawSignature = Base64.decode(\n                signature,\n                Base64.DEFAULT\n            );\n\n            if (rawSignature.length != 64 ||\n                !Base64.encodeToString(rawSignature, Base64.NO_WRAP).equals(signature)) {\n                return false;\n            }\n\n            Signature verifier =\n                Signature.getInstance("SHA256withECDSA");\n\n            verifier.initVerify(\n                loadTrustedKey(context)\n            );\n\n            verifier.update(\n                payload.getBytes(\n                    StandardCharsets.UTF_8\n                )\n            );\n\n            return verifier.verify(\n                p1363ToDer(rawSignature)\n            );\n        } catch (Exception error) {\n            return false;\n        }\n    }\n}\n',
  'JapanFlowOtaSequenceStore.java':
    'package ee.forgr.capacitor_updater;\n\nimport android.content.Context;\nimport android.content.SharedPreferences;\n\npublic final class JapanFlowOtaSequenceStore {\n\n    private static final String STORE =\n        "japanflow_ota_security_v1";\n\n    private static final String ACCEPTED =\n        "accepted_sequence";\n\n    private static final String PENDING =\n        "pending_sequence";\n\n    private static final String PENDING_BUNDLE =\n        "pending_bundle";\n\n    private static final String ATTEMPTED =\n        "highest_attempted_sequence";\n\n    private static final long MAX_SEQUENCE =\n        9007199254740991L;\n\n    private JapanFlowOtaSequenceStore() {}\n\n    private static SharedPreferences preferences(\n        Context context\n    ) {\n        return context.getSharedPreferences(\n            STORE,\n            Context.MODE_PRIVATE\n        );\n    }\n\n    private static boolean validSequence(long value) {\n        return value > 0 && value <= MAX_SEQUENCE;\n    }\n\n    public static synchronized long accepted(\n        Context context\n    ) {\n        return preferences(context)\n            .getLong(ACCEPTED, 0);\n    }\n\n    public static synchronized long attempted(\n        Context context\n    ) {\n        return preferences(context)\n            .getLong(ATTEMPTED, 0);\n    }\n\n    public static synchronized long pending(\n        Context context\n    ) {\n        return preferences(context)\n            .getLong(PENDING, 0);\n    }\n\n    public static synchronized String pendingBundle(\n        Context context\n    ) {\n        return preferences(context)\n            .getString(PENDING_BUNDLE, "");\n    }\n\n    public static synchronized boolean canAttempt(\n        Context context,\n        long sequence\n    ) {\n        return validSequence(sequence)\n            && pending(context) == 0\n            && sequence > accepted(context)\n            && sequence > attempted(context);\n    }\n\n    static synchronized boolean reserve(\n        Context context,\n        long sequence,\n        String bundleId\n    ) {\n        if (\n            bundleId == null ||\n            !bundleId.matches("[A-Za-z0-9_-]{1,128}") ||\n            !canAttempt(context, sequence)\n        ) {\n            return false;\n        }\n\n        return preferences(context)\n            .edit()\n            .putLong(PENDING, sequence)\n            .putString(PENDING_BUNDLE, bundleId)\n            .putLong(ATTEMPTED, sequence)\n            .commit();\n    }\n\n    static synchronized boolean confirm(\n        Context context,\n        long sequence,\n        String bundleId\n    ) {\n        if (\n            !validSequence(sequence) ||\n            sequence != pending(context) ||\n            bundleId == null ||\n            !bundleId.equals(pendingBundle(context)) ||\n            sequence <= accepted(context)\n        ) {\n            return false;\n        }\n\n        return preferences(context)\n            .edit()\n            .putLong(ACCEPTED, sequence)\n            .remove(PENDING)\n            .remove(PENDING_BUNDLE)\n            .commit();\n    }\n\n    static synchronized boolean fail(\n        Context context,\n        long sequence,\n        String bundleId\n    ) {\n        if (\n            !validSequence(sequence) ||\n            sequence != pending(context) ||\n            bundleId == null ||\n            !bundleId.equals(pendingBundle(context))\n        ) {\n            return false;\n        }\n\n        return preferences(context)\n            .edit()\n            .remove(PENDING)\n            .remove(PENDING_BUNDLE)\n            .commit();\n    }\n}\n',
  'JapanFlowPilotGate.java':
    'package ee.forgr.capacitor_updater;\n\nimport android.app.ActivityManager;\nimport android.content.Context;\nimport android.content.pm.PackageInfo;\nimport android.content.pm.PackageManager;\nimport android.content.pm.Signature;\nimport java.security.MessageDigest;\nimport java.util.Locale;\nimport org.json.JSONArray;\nimport com.getcapacitor.PluginCall;\n\n/** JapanFlow pilot: signed manifest and the real native bundle, not JS metadata. */\nfinal class JapanFlowPilotGate {\n    private static final String CERT = "ee61bb1ba2ba54de6af82eae80468c37577d0d8c2d4fdbd714fa89ec91e0f1e0";\n    private JapanFlowPilotGate() {}\n\n    @SuppressWarnings("deprecation")\n    private static int officialCode(Context context) throws Exception {\n        PackageInfo info = context.getPackageManager().getPackageInfo(\n            context.getPackageName(), PackageManager.GET_SIGNATURES);\n        Signature[] signatures = info.signatures;\n        if (!"com.japanflow.mobile".equals(context.getPackageName()) || signatures == null || signatures.length != 1) return -1;\n        byte[] digest = MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());\n        StringBuilder hex = new StringBuilder();\n        for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b & 255));\n        return CERT.equals(hex.toString()) ? info.versionCode : -1;\n    }\n\n    @SuppressWarnings("deprecation")\n    private static boolean gpsStopped(Context context) {\n        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);\n        if (manager == null) return false;\n        java.util.List<ActivityManager.RunningServiceInfo> services = manager.getRunningServices(Integer.MAX_VALUE);\n        if (services == null) return false;\n        for (ActivityManager.RunningServiceInfo service : services) {\n            if ("com.japanflow.mobile.JapanFlowGpsService".equals(service.service.getClassName())) return false;\n        }\n        return true;\n    }\n\n    private static JSONArray manifest(Context context, PluginCall call) throws Exception {\n        String payload = call.getString("payload");\n        if (!JapanFlowOtaSecurity.verify(context, payload, call.getString("signature"))) return null;\n        JSONArray data = new JSONArray(payload);\n        int code = officialCode(context);\n        long now = System.currentTimeMillis();\n        if (data.length() != 21 || !"japanflow-ota-v2".equals(data.getString(0))\n            || !"com.japanflow.mobile".equals(data.getString(1)) || data.getInt(2) != 1\n            || !data.getString(3).matches("[0-9]{1,6}\\\\.[0-9]{1,6}\\\\.[0-9]{1,6}")\n            || !"android".equals(data.getString(4)) || !"beta".equals(data.getString(7))\n            || !"published".equals(data.getString(8)) || code < 19\n            || data.getInt(9) < 19 || code < data.getInt(9) || code > data.getInt(10)\n            || !data.getString(11).matches("[a-f0-9]{64}") || data.getLong(16) <= now\n            || data.getLong(16) - now > 16 * 60 * 1000L\n            || data.getJSONArray(17).length() == 0 || data.getJSONArray(17).length() > 5\n            || !JapanFlowOtaSequenceStore.canAttempt(context, data.getLong(15))) return null;\n        JSONArray meta = data.getJSONArray(18);\n        if (meta.length() != 5 || !"capgo-rsa-aes-v1".equals(meta.getString(0))) return null;\n        return data;\n    }\n\n    static boolean authorizeDownload(Context context, PluginCall call) {\n        try {\n            JSONArray data = manifest(context, call);\n            if (data == null || !gpsStopped(context) || call.getData().has("manifest")) return false;\n            JSONArray meta = data.getJSONArray(18);\n            return data.getString(14).equals(call.getString("url"))\n                && data.getString(3).equals(call.getString("version"))\n                && meta.getString(1).equals(call.getString("checksum"))\n                && meta.getString(2).equals(call.getString("sessionKey"));\n        } catch (Exception error) { return false; }\n    }\n\n    static synchronized boolean reserve(Context context, PluginCall call, BundleInfo bundle, BundleInfo current) {\n        try {\n            JSONArray data = manifest(context, call);\n            if (data == null || !gpsStopped(context) || bundle == null || current == null\n                || bundle.isBuiltin() || bundle.isUnknown() || !bundle.isDownloaded()\n                || bundle.getStatus() != BundleStatus.PENDING || bundle.getId().equals(current.getId())\n                || !bundle.getId().equals(call.getString("id"))\n                || !data.getString(11).equals(bundle.getChecksum())\n                || !data.getString(3).equals(bundle.getVersionName())) return false;\n            return JapanFlowOtaSequenceStore.reserve(context, data.getLong(15), bundle.getId());\n        } catch (Exception error) { return false; }\n    }\n\n    static synchronized boolean reconcile(Context context, BundleInfo actual) {\n        try {\n            long sequence = JapanFlowOtaSequenceStore.pending(context);\n            if (sequence == 0) return true;\n            String expected = JapanFlowOtaSequenceStore.pendingBundle(context);\n            if (actual == null) return false;\n            return expected.equals(actual.getId())\n                ? JapanFlowOtaSequenceStore.confirm(context, sequence, expected)\n                : JapanFlowOtaSequenceStore.fail(context, sequence, expected);\n        } catch (Exception error) { return false; }\n    }\n}\n',
};
if (![original, patched].includes(sha(source)) || sha(target) !== patched)
  throw new Error('Unexpected Capgo Java source; refusing to patch');
for (const [name, content] of Object.entries(helpers)) {
  const targetFile = path.join(dir, name);
  if (
    fs.existsSync(targetFile) &&
    fs.readFileSync(targetFile, 'utf8').replace(/\r\n/g, '\n') !== content
  )
    throw new Error('Unexpected helper: ' + name);
}
for (const [name, content] of Object.entries(helpers))
  fs.writeFileSync(path.join(dir, name), content);
fs.writeFileSync(file, target);
console.log('CAPGO 8.54.2 JAPANFLOW PILOT GUARD VERIFIED');
