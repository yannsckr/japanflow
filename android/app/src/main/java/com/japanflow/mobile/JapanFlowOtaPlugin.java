package com.japanflow.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
