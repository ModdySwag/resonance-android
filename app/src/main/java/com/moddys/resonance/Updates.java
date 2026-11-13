package com.moddys.resonance;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Keeps the sideloaded app current.
 *
 * <p>Not distributed through Play, so Play's in-app update flow does not exist; the check is
 * one small JSON file on the site (the same file the World Radio apps read - this app is the
 * "resonance-android" entry) and the install is the same APK download the user did the first
 * time, carried out by DownloadManager and handed to the system installer.
 *
 * <p>Nothing here runs on the UI thread, and nothing installs without the user's tap.
 */
final class Updates {

    static final String TAG = "ResonanceStudio";

    /** The feed. A timestamp is added so no cache can hand back a stale answer. */
    private static final String FEED = "https://moddys.net/updates.json";
    private static final String FEED_KEY = "resonance-android";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final long CHECK_AGAIN_AFTER_MS = 10 * 60 * 1000L;

    private static long lastCheckedAt = 0;

    /**
     * A download or install the person has already asked for, waiting on the one thing only
     * they can give: the "install unknown apps" grant. Without this the flow dead-ended -
     * the app opened the settings screen and forgot the request, the shell's button stayed on
     * "Downloading…" for ever, and the only way forward was to leave the app and install the
     * APK from Downloads by hand.
     */
    private static final int STAGE_NONE = 0;
    private static final int STAGE_PERMISSION = 1;   // waiting for the grant
    private static final int STAGE_INSTALLER = 2;    // the system installer is on screen
    private static int pendingStage = STAGE_NONE;

    /** What to download once the grant lands (permission is asked before any bytes move). */
    private static String pendingUrl, pendingVersion, pendingSha;
    /** A downloaded, verified APK waiting for the grant (permission pulled mid-flight). */
    private static Uri pendingApk;

    /** The download in flight, so the poll and the receiver cannot both install it. */
    private static volatile long activeDownloadId = -1;
    private static final Handler UI = new Handler(Looper.getMainLooper());

    private Updates() { }

    /** What the feed says about this platform, once compared with this build. */
    static final class Info {
        final boolean available;
        final int code;
        final String version, url, sha256, notes;

        Info(boolean available, int code, String version, String url, String sha256, String notes) {
            this.available = available;
            this.code = code;
            this.version = version == null ? "" : version;
            this.url = url == null ? "" : url;
            this.sha256 = sha256 == null ? "" : sha256;
            this.notes = notes == null ? "" : notes;
        }

        /** The shape the shell reads: window.__rsUpdate.available({...}). */
        String json() {
            JSONObject o = new JSONObject();
            try {
                o.put("version", version);
                o.put("url", url);
                o.put("sha256", sha256);
                o.put("notes", notes);
                o.put("code", code);
                o.put("platform", "android");
            } catch (Exception e) {
                Log.w(TAG, "info json: " + e);
            }
            return o.toString();
        }
    }

    interface Callback {
        /** Exactly one of the two is non-null. */
        void onResult(Info info, String error);
    }

    /** Ask the site what the newest build is. Never throws; failures arrive as an error. */
    static void check(final Context ctx, final boolean manual, final Callback cb) {
        /* Play delivers this build's updates, and the play manifest carries no network
           permission: there is no feed to read. Say "current" rather than "failed" - the app is
           up to date as far as anything this build can see. BuildConfig.SELF_UPDATE is a
           compile-time constant, so in the play flavour every line below this guard is dead
           code and R8 drops it along with the network classes it uses. */
        if (!BuildConfig.SELF_UPDATE) {
            cb.onResult(new Info(false, versionCode(ctx), "", "", "", ""), null);
            return;
        }
        if (!manual && System.currentTimeMillis() - lastCheckedAt < CHECK_AGAIN_AFTER_MS) {
            return;                      // a launch check already ran recently; do not nag the site
        }
        lastCheckedAt = System.currentTimeMillis();
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                Info info = null;
                String error = null;
                try {
                    info = fetch(app);
                } catch (Exception e) {
                    error = e.toString();
                }
                final Info result = info;
                final String failure = error;
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override
                    public void run() { cb.onResult(result, failure); }
                });
            }
        }, "update-check").start();
    }

    private static Info fetch(Context ctx) throws Exception {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(FEED + "?t=" + System.currentTimeMillis()).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(6000);
            c.setRequestProperty("Cache-Control", "no-cache");
            c.setRequestProperty("Accept", "application/json");
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            JSONObject all = new JSONObject(sb.toString());
            JSONObject a = all.optJSONObject(FEED_KEY);
            if (a == null) throw new IllegalStateException("no " + FEED_KEY + " entry in the feed");
            int theirs = a.optInt("versionCode", 0);
            int mine = versionCode(ctx);
            return new Info(theirs > mine, theirs, a.optString("versionName"),
                    a.optString("url"), a.optString("sha256"), a.optString("notes"));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** This build's version code, without depending on generated BuildConfig. */
    static int versionCode(Context ctx) {
        try {
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= 28) return (int) p.getLongVersionCode();
            return p.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Download the new APK and hand it to the system installer. One tap from the shell reaches
     * here; the system's own confirmation is the last step, and it is not skippable by design.
     */
    /** Only the project's own host may serve an update: a tampered feed must not be able
     *  to point the downloader at another origin. */
    static boolean trustedUrl(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol())) return false;
            String h = u.getHost();
            return "moddys.net".equalsIgnoreCase(h) || "www.moddys.net".equalsIgnoreCase(h);
        } catch (Exception e) {
            return false;
        }
    }

    @android.annotation.SuppressLint("InlinedApi")   /* RECEIVER_NOT_EXPORTED inlines to 4; a forged
        broadcast still cannot pass the download-id and sha256 checks below */
    static void downloadAndInstall(final Activity act, String url, String version, final String sha256) {
        /* The play build has no installer permission and no network permission, so this must be
           unreachable there even if the shell's notice somehow calls the bridge. Same
           compile-time constant as check(): in the play flavour the rest of this method - the
           DownloadManager hand-off and the ACTION_VIEW into the system installer - does not
           survive into the dex. */
        if (!BuildConfig.SELF_UPDATE) {
            Log.i(TAG, "update: ignored - this build is updated through Google Play");
            return;
        }
        if (url == null || url.trim().isEmpty()) {
            toast(act, "The update feed has no download link yet.");
            return;
        }
        if (!trustedUrl(url.trim())) {
            toast(act, "The update link is not on moddys.net - not downloading.");
            return;
        }
        if (sha256 == null || !sha256.trim().matches("[0-9a-fA-F]{64}")) {
            toast(act, "The update feed has no valid checksum - not downloading.");
            return;
        }
        /* Android 8+ makes "install unknown apps" a per-app permission and only the person
           can grant it. Ask before moving any bytes, and remember the request: the grant used
           to be a dead end (settings opened, request forgotten, ribbon stuck on
           "Downloading…" for ever, APK stranded in Downloads). */
        if (!act.getPackageManager().canRequestPackageInstalls()) {
            pendingUrl = url.trim();
            pendingVersion = version;
            pendingSha = sha256;
            pendingStage = STAGE_PERMISSION;
            tellShell("installNeeded");
            toast(act, "Allow installs for Resonance Studio - the update continues when you come back.");
            openInstallSettings(act);
            return;
        }
        startDownload(act, url, version, sha256);
    }

    /** The download itself, once the install grant is in place (or was never needed). */
    private static void startDownload(final Activity act, String url, String version, final String sha256) {
        pendingStage = STAGE_NONE;
        pendingUrl = null;
        pendingVersion = null;
        pendingSha = null;
        tellShell("downloading");
        try {
            final DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) { toast(act, "This device has no download service."); return; }
            String name = "resonance-studio-" + (version == null || version.isEmpty() ? "update" : version) + ".apk";
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("Resonance Studio " + version);
            req.setDescription("Downloading the update");
            req.setMimeType(APK_MIME);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(act, null, name);
            final long id = dm.enqueue(req);

            BroadcastReceiver done = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    /* Unregister first, on every path: a completion for some other download
                       used to return here and leave this receiver (and the Activity it
                       captured) alive for the rest of the process. */
                    try { c.getApplicationContext().unregisterReceiver(this); } catch (Exception e) { }
                    long finished = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (finished != id || !isActive(id)) return;   // the poll may have won
                    activeDownloadId = -1;
                    install(act, dm, id, sha256);
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            /* The completion is sent by the downloads provider - a different app and uid -
               so a NOT_EXPORTED receiver never sees it on Android 13+ and the install never
               started. Exported is safe here: a forged completion still has to name this
               download id, and the APK is re-hashed before anything is installed. */
            act.getApplicationContext().registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
            activeDownloadId = id;
            pollDownload(act, dm, id, sha256, 0);       // the path that cannot be dropped
            toast(act, "Downloading the update - Android will ask to install it when it lands.");
        } catch (Exception e) {
            Log.w(TAG, "update download: " + e);
            toast(act, "Could not start the download: " + e);
        }
    }

    private static void install(Activity act, DownloadManager dm, long id, String sha256) {
        try {
            Uri apk = dm.getUriForDownloadedFile(id);
            if (apk == null) {
                tellShell("installCancelled");      // the shell's button must not stay dead
                toast(act, "The downloaded update could not be opened.");
                return;
            }

            /* The feed carries a checksum, so verify what arrived before offering it: a
               truncated download must not reach the installer pretending to be an app.
               A missing or malformed checksum is a refusal, not a skip - the old code
               installed unverified bytes when the feed omitted the field. */
            if (sha256 == null || !sha256.trim().matches("[0-9a-fA-F]{64}")) {
                tellShell("installCancelled");
                toast(act, "The update feed has no valid checksum - not installing.");
                return;
            }
            if (!matches(act, apk, sha256)) {
                tellShell("installCancelled");
                toast(act, "The downloaded file did not match the published one - not installing.");
                return;
            }

            /* Android 8+ makes "install unknown apps" a per-app permission. Installing an
               update over the running app needs it, and only the user can grant it. Keep the
               verified APK and finish the job when they come back instead of dropping it. */
            if (!act.getPackageManager().canRequestPackageInstalls()) {
                pendingApk = apk;
                pendingStage = STAGE_PERMISSION;
                tellShell("installNeeded");
                toast(act, "Allow installs for Resonance Studio - the update continues when you come back.");
                openInstallSettings(act);
                return;
            }

            launchInstaller(act, apk);
        } catch (Exception e) {
            pendingStage = STAGE_NONE;
            pendingApk = null;
            tellShell("installCancelled");
            Log.w(TAG, "update install: " + e);
            toast(act, "Could not start the installer: " + e);
        }
    }

    /** Hand a verified APK to the system installer and remember that we did. */
    private static void launchInstaller(Activity act, Uri apk) {
        try {
            pendingStage = STAGE_INSTALLER;
            tellShell("installing");
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(apk, APK_MIME);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(i);
        } catch (Exception e) {
            pendingStage = STAGE_NONE;
            pendingApk = null;
            tellShell("installCancelled");
            Log.w(TAG, "update install: " + e);
            toast(act, "Could not start the installer: " + e);
        }
    }

    /** The one screen that lets this app install its own update. */
    private static void openInstallSettings(Activity act) {
        try {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + act.getPackageName()));
            allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(allow);
        } catch (Exception e) {
            Log.w(TAG, "install settings: " + e);
            toast(act, "Open Settings > Apps > Special access > Install unknown apps, allow Resonance Studio, then tap Update.");
        }
    }

    /**
     * Called from {@link MainActivity#onResume}. A person who taps "Update now", grants the
     * permission and comes back gets the rest of the update without touching anything again:
     * the download starts (or the already-downloaded APK goes to the installer).
     */
    static void onResumed(Activity act) {
        if (pendingStage == STAGE_PERMISSION) {
            if (!act.getPackageManager().canRequestPackageInstalls()) return;   // not granted yet
            if (pendingApk != null) launchInstaller(act, pendingApk);
            else if (pendingUrl != null) startDownload(act, pendingUrl, pendingVersion, pendingSha);
            else pendingStage = STAGE_NONE;
            return;
        }
        if (pendingStage == STAGE_INSTALLER) {
            /* Back from the installer: either the update replaced this process (in which case
               nothing here runs again) or the person cancelled. Give the strip back rather
               than leaving a dead "Installing…" on screen. */
            pendingStage = STAGE_NONE;
            pendingApk = null;
            tellShell("installCancelled");
        }
    }

    /** The shell's "Allow installs" / "Install now" button. */
    static void resumeInstall(Activity act) {
        if (pendingApk != null) {
            if (act.getPackageManager().canRequestPackageInstalls()) launchInstaller(act, pendingApk);
            else openInstallSettings(act);
            return;
        }
        if (pendingUrl != null) {
            if (act.getPackageManager().canRequestPackageInstalls()) {
                startDownload(act, pendingUrl, pendingVersion, pendingSha);
            } else {
                openInstallSettings(act);
            }
            return;
        }
        toast(act, "Nothing is waiting to install - check for updates again.");
    }

    /** Tell the shell what stage the update is in; harmless when there is no page. */
    private static void tellShell(String method) {
        MainActivity.pageCommand("window.__rsUpdate && window.__rsUpdate." + method + "()");
    }

    private static boolean isActive(long id) { return activeDownloadId == id; }

    /**
     * Watch the download to its end without depending on a broadcast.
     *
     * <p>ACTION_DOWNLOAD_COMPLETE is sent by the downloads provider, not by this app, and a
     * RECEIVER_NOT_EXPORTED receiver refuses it - which is how an update could finish
     * downloading, leave the APK in Downloads and leave the shell's strip on "Downloading…"
     * for ever. The poll is the part no delivery rule can drop; the receiver above is the
     * fast path and both are guarded by the same id so the install runs once.
     */
    private static void pollDownload(final Activity act, final DownloadManager dm, final long id,
                                     final String sha, final int attempt) {
        UI.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isActive(id)) return;
                if (act.isFinishing() || act.isDestroyed()) { activeDownloadId = -1; return; }
                int status = statusOf(dm, id);
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    activeDownloadId = -1;
                    install(act, dm, id, sha);
                } else if (status == DownloadManager.STATUS_FAILED) {
                    activeDownloadId = -1;
                    tellShell("installCancelled");
                    toast(act, "The update download did not finish - try again.");
                } else if (attempt < 300) {                 // ~10 minutes at 2 s
                    pollDownload(act, dm, id, sha, attempt + 1);
                }
            }
        }, 2000);
    }

    private static int statusOf(DownloadManager dm, long id) {
        Cursor c = null;
        try {
            c = dm.query(new DownloadManager.Query().setFilterById(id));
            if (c != null && c.moveToFirst()) {
                return c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            }
            return DownloadManager.STATUS_PENDING;
        } catch (Exception e) {
            return DownloadManager.STATUS_PENDING;
        } finally {
            if (c != null) c.close();
        }
    }

    private static boolean matches(Context ctx, Uri apk, String expected) {
        InputStream in = null;
        try {
            in = ctx.getContentResolver().openInputStream(apk);
            if (in == null) return false;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString().equalsIgnoreCase(expected.trim());
        } catch (Exception e) {
            Log.w(TAG, "update verify: " + e);
            return false;
        } finally {
            try { if (in != null) in.close(); } catch (Exception e) { }
        }
    }

    private static void toast(final Activity act, final String message) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(act, message, Toast.LENGTH_LONG).show();
            }
        });
    }
}
