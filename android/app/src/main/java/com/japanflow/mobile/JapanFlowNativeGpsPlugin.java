package com.japanflow.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;

@CapacitorPlugin(name = "JapanFlowNativeGps")
public class JapanFlowNativeGpsPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("customToken");
        String userId = call.getString("userId");
        String journeyId = call.getString("journeyId");
        if (token == null || token.length() < 60 || userId == null ||
                !userId.matches("[A-Za-z0-9_-]{1,128}") ||
                journeyId == null || !journeyId.matches("[A-Za-z0-9_-]{1,128}_[0-9]{4}-[0-9]{2}-[0-9]{2}") ||
                !journeyId.startsWith(userId + "_")) {
            call.reject("Sessão de GPS inválida.");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Permissão de localização não concedida.");
            return;
        }
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            call.reject("Firebase Android não configurado: confira google-services.json.");
            return;
        }
        FirebaseAuth.getInstance().signInWithCustomToken(token).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                call.reject("Falha na autenticação do rastreamento nativo.");
                return;
            }
            Intent intent = new Intent(getContext(), JapanFlowGpsService.class);
            intent.setAction(JapanFlowGpsService.ACTION_START);
            intent.putExtra(JapanFlowGpsService.EXTRA_USER_ID, userId);
            intent.putExtra(JapanFlowGpsService.EXTRA_JOURNEY_ID, journeyId);
            try {
                ContextCompat.startForegroundService(getContext(), intent);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject("O Android impediu o serviço GPS: " + e.getClass().getSimpleName());
            }
        });
    }


    @PluginMethod
    public void checkUpdateReadiness(PluginCall call) {
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            JSObject result = new JSObject();
            result.put("confirmed", false);
            result.put("reason", "firebase-unavailable");
            call.resolve(result);
            return;
        }

        final java.util.concurrent.atomic.AtomicBoolean completed =
            new java.util.concurrent.atomic.AtomicBoolean(false);

        final android.os.Handler handler =
            new android.os.Handler(android.os.Looper.getMainLooper());

        final Runnable timeout = () -> {
            if (!completed.compareAndSet(false, true)) return;

            JSObject result = new JSObject();
            result.put("confirmed", false);
            result.put("reason", "sync-timeout");
            call.resolve(result);
        };

        handler.postDelayed(timeout, 5000);

        try {
            com.google.firebase.firestore.FirebaseFirestore
                .getInstance()
                .waitForPendingWrites()
                .addOnCompleteListener(task -> {
                    if (!completed.compareAndSet(false, true)) return;

                    handler.removeCallbacks(timeout);

                    JSObject result = new JSObject();
                    result.put("confirmed", task.isSuccessful());
                    result.put(
                        "reason",
                        task.isSuccessful()
                            ? "writes-confirmed"
                            : "sync-failed"
                    );
                    call.resolve(result);
                });
        } catch (Exception error) {
            if (!completed.compareAndSet(false, true)) return;

            handler.removeCallbacks(timeout);

            JSObject result = new JSObject();
            result.put("confirmed", false);
            result.put("reason", "native-sync-error");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), JapanFlowGpsService.class);
        getContext().stopService(intent);
        if (!FirebaseApp.getApps(getContext()).isEmpty()) FirebaseAuth.getInstance().signOut();
        call.resolve(new JSObject());
    }
}
