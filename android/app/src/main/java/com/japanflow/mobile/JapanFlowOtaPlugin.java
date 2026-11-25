package com.japanflow.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name = "JapanFlowOtaSecurity")
public class JapanFlowOtaPlugin extends Plugin {


    @PluginMethod
    public void getSequenceState(PluginCall call) {
        try {
            JSObject result = new JSObject();

            result.put(
                "acceptedSequence",
                JapanFlowOtaSequenceStore.accepted(getContext())
            );

            result.put(
                "attemptedSequence",
                JapanFlowOtaSequenceStore.attempted(getContext())
            );

            result.put(
                "pendingSequence",
                JapanFlowOtaSequenceStore.pending(getContext())
            );

            result.put(
                "pendingBundleId",
                JapanFlowOtaSequenceStore.pendingBundle(getContext())
            );

            call.resolve(result);
        } catch (Exception error) {
            call.reject("Native OTA sequence state unavailable");
        }
    }

    @PluginMethod
    public void reserveActivation(PluginCall call) {
        boolean ok = false;
        try {
            String payload = call.getString("payload");
            String signature = call.getString("signature");
            String bundleId = call.getString("bundleId");
            if (JapanFlowOtaSecurity.verify(getContext(), payload, signature)) {
                JSONArray data = new JSONArray(payload);
                if (data.length() == 21 && "japanflow-ota-v2".equals(data.getString(0))
                    && "com.japanflow.mobile".equals(data.getString(1))
                    && "published".equals(data.getString(8))
                    && data.getLong(16) > System.currentTimeMillis()) {
                    ok = JapanFlowOtaSequenceStore.reserve(getContext(), data.getLong(15), bundleId);
                }
            }
        } catch (Exception ignored) {}
        JSObject result = new JSObject();
        result.put("ok", ok);
        call.resolve(result);
    }

    @PluginMethod
    public void reconcileActivation(PluginCall call) {
        boolean ok = false;
        try {
            long pending = JapanFlowOtaSequenceStore.pending(getContext());
            String expected = JapanFlowOtaSequenceStore.pendingBundle(getContext());
            String actual = call.getString("currentBundleId");
            if (pending == 0) ok = true;
            else if (actual != null && !actual.isEmpty()) {
                if (expected.equals(actual)) {
                    ok = JapanFlowOtaSequenceStore.confirm(getContext(), pending, expected);
                } else {
                    ok = JapanFlowOtaSequenceStore.fail(getContext(), pending, expected);
                }
            }
        } catch (Exception ignored) {}
        JSObject result = new JSObject();
        result.put("ok", ok);
        call.resolve(result);
    }

    @PluginMethod
    public void verifySignature(PluginCall call) {
        String payload = call.getString("payload");
        String signature = call.getString("signature");

        boolean verified =
            JapanFlowOtaSecurity.verify(
                getContext(),
                payload,
                signature
            );

        JSObject result = new JSObject();
        result.put("verified", verified);

        call.resolve(result);
    }
}
