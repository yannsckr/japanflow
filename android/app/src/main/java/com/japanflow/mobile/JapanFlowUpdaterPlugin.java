package com.japanflow.mobile;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.util.Locale;

@CapacitorPlugin(name = "JapanFlowUpdater")
public class JapanFlowUpdaterPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long downloadId = -1;
    private File apkFile;
    private Runnable monitor;

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            JSObject out = new JSObject();
            android.content.pm.PackageInfo info = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            out.put("version", info.versionName == null ? "0.0.0" : info.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            call.resolve(out);
        } catch (Exception e) { call.reject("Não foi possível identificar a versão", e); }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) { call.reject("O endereço precisa usar HTTPS"); return; }
        if (downloadId != -1) { call.reject("Já existe um download em andamento"); return; }
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!host.equals("firebasestorage.googleapis.com") && !host.endsWith(".googleapis.com")) {
                call.reject("Origem de atualização não autorizada"); return;
            }
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) { call.reject("Armazenamento indisponível"); return; }
            apkFile = new File(dir, "japanflow-update.apk");
            if (apkFile.exists() && !apkFile.delete()) { call.reject("Não foi possível limpar o download anterior"); return; }
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle("Atualização JapanFlow");
            request.setDescription("Baixando atualização no aplicativo");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "japanflow-update.apk");
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) { call.reject("Gerenciador de downloads indisponível"); return; }
            downloadId = manager.enqueue(request);
            long id = downloadId;
            monitor = new Runnable() {
                @Override public void run() {
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                    try (Cursor cursor = manager.query(query)) {
                        if (cursor == null || !cursor.moveToFirst()) { send("error", 0, "Download não encontrado"); downloadId = -1; return; }
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        int percent = total > 0 ? (int)Math.min(100, done * 100 / total) : 0;
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            if (apkFile != null && apkFile.exists() && apkFile.length() > 0) send("complete", 100, "Download concluído");
                            else send("error", percent, "Arquivo baixado inválido");
                            downloadId = -1; return;
                        }
                        if (status == DownloadManager.STATUS_FAILED) { send("error", percent, "Falha no download"); downloadId = -1; return; }
                        send("downloading", percent, "Baixando");
                        handler.postDelayed(this, 450);
                    } catch (Exception ex) { send("error", 0, ex.getMessage()); downloadId = -1; }
                }
            };
            handler.post(monitor);
            call.resolve();
        } catch (Exception e) { downloadId = -1; call.reject("Não foi possível iniciar o download", e); }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        if (apkFile == null || !apkFile.exists() || apkFile.length() < 1024) {
            call.reject("Baixe uma atualização antes de instalar"); return;
        }
        try {
            PackageManager pm = getContext().getPackageManager();
            android.content.pm.PackageInfo candidate = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
            android.content.pm.PackageInfo current = pm.getPackageInfo(getContext().getPackageName(), 0);
            if (candidate == null || !getContext().getPackageName().equals(candidate.packageName)) {
                call.reject("O APK não pertence ao JapanFlow"); return;
            }
            long candidateCode = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
            long currentCode = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
            if (candidateCode <= currentCode) {
                call.reject("O APK deve ter versionCode superior à versão instalada"); return;
            }
            if (Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                call.reject("Autorize instalações para JapanFlow e toque novamente em Instalar");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) { call.reject("Falha ao abrir instalador Android", e); }
    }

    private void send(String status, int percent, String message) {
        JSObject payload = new JSObject();
        payload.put("status", status);
        payload.put("percent", percent);
        payload.put("message", message == null ? "" : message);
        notifyListeners("progress", payload);
    }

    @Override protected void handleOnDestroy() {
        if (monitor != null) handler.removeCallbacks(monitor);
        super.handleOnDestroy();
    }
}
