package com.japanflow.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.Handler;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.SetOptions;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

/** Independent Android foreground service: Firestore writes do not use the WebView. */
public final class JapanFlowGpsService extends Service implements LocationListener {
    public static final String ACTION_START = "com.japanflow.mobile.GPS_START";
    public static final String ACTION_STOP = "com.japanflow.mobile.GPS_STOP";
    public static final String EXTRA_USER_ID = "user_id";
    public static final String EXTRA_JOURNEY_ID = "journey_id";
    private static final String CHANNEL = "japanflow_gps";
    private static final int NOTIFICATION_ID = 462;
    private static final long MIN_INTERVAL_MS = 15_000;
    // Interrompe a coleta mesmo se o dispositivo permanecer parado e sem callbacks GPS.
    private static final long OFFLINE_GRACE_MS = 120_000;
    private static final long WATCHDOG_INTERVAL_MS = 20_000;
    private final Handler watchdog = new Handler(Looper.getMainLooper());
    private long offlineSince;
    private final Runnable watchdogTask = new Runnable() {
        @Override public void run() {
            if (journeyId == null || userId == null) return;
            long now = System.currentTimeMillis();
            String today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
            if (!journeyId.endsWith("_" + today) || now - startedAt > 12L * 60 * 60 * 1000 ||
                    !hasLocationPermission() || FirebaseAuth.getInstance().getCurrentUser() == null) {
                stopSelf();
                return;
            }
            if (!hasInternet()) {
                if (offlineSince == 0) offlineSince = now;
                if (now - offlineSince >= OFFLINE_GRACE_MS) {
                    // Sem internet prolongada: para de capturar ate a proxima ativacao autorizada.
                    stopSelf();
                    return;
                }
            } else {
                offlineSince = 0;
            }
            watchdog.postDelayed(this, WATCHDOG_INTERVAL_MS);
        }
    };
    private String userId;
    private String journeyId;
    private LocationManager manager;
    private ListenerRegistration journeyListener;
    private DocumentReference sessionRef;
    private boolean subscribed;
    private boolean phasePresent;
    private long lastSent;
    private long startedAt;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;
        String nextUser = intent.getStringExtra(EXTRA_USER_ID);
        String nextJourney = intent.getStringExtra(EXTRA_JOURNEY_ID);
        if (nextUser == null || nextJourney == null ||
                !nextJourney.matches("[A-Za-z0-9_-]{1,128}_[0-9]{4}-[0-9]{2}-[0-9]{2}") ||
                !nextJourney.startsWith(nextUser + "_") ||
                FirebaseAuth.getInstance().getCurrentUser() == null || !hasLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try { showForegroundNotification(); } catch (Exception error) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (nextJourney.equals(journeyId) && nextUser.equals(userId)) return START_NOT_STICKY;
        cleanup();
        userId = nextUser;
        journeyId = nextJourney;
        startedAt = System.currentTimeMillis();
        offlineSince = 0;
        watchdog.removeCallbacks(watchdogTask);
        watchdog.postDelayed(watchdogTask, WATCHDOG_INTERVAL_MS);
        FirebaseFirestore store = FirebaseFirestore.getInstance();
        sessionRef = store.collection("motoboy_live_sessions").document(userId);
        sessionRef.get().addOnSuccessListener(snapshot -> {
            if (snapshot.exists()) phasePresent = true;
        });
        journeyListener = store.collection("motoboy_journeys").document(journeyId)
            .addSnapshotListener((snapshot, error) -> {
                if (error != null) {
                    // Fail closed on explicit denial. Offline cache is allowed only up to the daily cutoff.
                    if ("PERMISSION_DENIED".equals(error.getCode().name())) stopSelf();
                    return;
                }
                if (snapshot == null || !snapshot.exists()) {
                    // Do not start on missing/cached documents.
                    if (snapshot != null && !snapshot.getMetadata().isFromCache()) stopSelf();
                    return;
                }
                boolean active = snapshot.get("started_at") != null && snapshot.get("ended_at") == null &&
                    (snapshot.get("lunch_started_at") == null || snapshot.get("lunch_ended_at") != null);
                if (!active) { stopSelf(); return; }
                if (!subscribed && !snapshot.getMetadata().isFromCache()) startLocationUpdates();
            });
        return START_NOT_STICKY;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void showForegroundNotification() {
        NotificationManager notifications = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "JapanFlow · GPS em jornada", NotificationManager.IMPORTANCE_LOW));
        }
        Intent stop = new Intent(this, JapanFlowGpsService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(this, 462, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("JapanFlow · Rastreamento ativo")
            .setContentText("Envia posição ao vivo durante a jornada. Encerre no app.")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Parar envio nativo", stopAction)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startLocationUpdates() {
        if (subscribed || !hasLocationPermission()) { if (!hasLocationPermission()) stopSelf(); return; }
        manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            boolean any = false;
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_INTERVAL_MS, 20f, this, Looper.getMainLooper());
                any = true;
            }
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_INTERVAL_MS, 20f, this, Looper.getMainLooper());
                any = true;
            }
            subscribed = any;
            if (!any) stopSelf();
        } catch (SecurityException e) { stopSelf(); }
    }

    private boolean hasInternet() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null || cm.getActiveNetwork() == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    @Override public void onLocationChanged(@NonNull Location location) {
        if (!subscribed || sessionRef == null || !hasLocationPermission() ||
                FirebaseAuth.getInstance().getCurrentUser() == null) { stopSelf(); return; }
        long now = System.currentTimeMillis();
        // Failsafe for lost connection or process/lifecycle mismatches: never track into the next day.
        String today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
        if (!journeyId.endsWith("_" + today) || now - startedAt > 12L * 60 * 60 * 1000) {
            stopSelf(); return;
        }
        // Never replay old location as a fresh live position after reconnecting.
        // V46.1 retains historical samples separately; this service publishes only live data.
        if (!hasInternet() || now - location.getTime() > 30_000 ||
                now - lastSent < MIN_INTERVAL_MS || !location.hasAccuracy() ||
                location.getAccuracy() < 0 || location.getAccuracy() > 150 ||
                Math.abs(location.getLatitude()) > 90 || Math.abs(location.getLongitude()) > 180) return;
        lastSent = now;
        Map<String, Object> data = new HashMap<>();
        data.put("user_id", userId);
        data.put("lat", location.getLatitude());
        data.put("lng", location.getLongitude());
        data.put("accuracy", location.getAccuracy());
        data.put("updated_at", FieldValue.serverTimestamp());
        if (!phasePresent) { data.put("phase", "returning"); phasePresent = true; }
        // Firestore SDK native performs network transmission without the WebView.
        // No offline live replay: reconnect sends only a new coordinate.
        sessionRef.set(data, SetOptions.merge());
    }

    private void cleanup() {
        watchdog.removeCallbacks(watchdogTask);
        offlineSince = 0;
        if (manager != null) {
            try { manager.removeUpdates(this); } catch (SecurityException ignored) { }
        }
        if (journeyListener != null) journeyListener.remove();
        subscribed = false;
        phasePresent = false;
        manager = null;
        journeyListener = null;
    }

    @Override public void onDestroy() {
        cleanup();
        super.onDestroy();
    }
}
