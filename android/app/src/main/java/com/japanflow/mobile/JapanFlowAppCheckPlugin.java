package com.japanflow.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

@CapacitorPlugin(name = "JapanFlowAppCheck")
public class JapanFlowAppCheckPlugin extends Plugin {

    @Override
    public void load() {
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            FirebaseApp.initializeApp(getContext());
        }

        FirebaseAppCheck.getInstance()
            .installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            );
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseAppCheck.getInstance()
                .getAppCheckToken(false)
                .addOnSuccessListener(token -> {
                    JSObject result = new JSObject();

                    result.put("token", token.getToken());
                    result.put(
                        "expireTimeMillis",
                        token.getExpireTimeMillis()
                    );

                    call.resolve(result);
                })
                .addOnFailureListener(error ->
                    call.reject("App Check attestation failed")
                );
        } catch (Exception error) {
            call.reject("Native App Check unavailable");
        }
    }
}
