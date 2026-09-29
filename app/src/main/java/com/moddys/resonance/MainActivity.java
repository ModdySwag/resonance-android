package com.moddys.resonance;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.lang.ref.WeakReference;
import java.net.URLDecoder;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.json.JSONObject;

/**
 * Hosts the Resonance Studio web app in a WebView and connects it to the Android shell:
 * a foreground playback service, lock-screen controls, file import/save, and a mobile
 * player + menu layer injected as a shell shim.
 *
 * <p>The app is served over <code>https://appassets.androidplatform.net/</code>, an origin
 * whose every request is answered from the APK's own assets (see {@link #shouldInterceptRequest}).
 * That matters for two reasons: the studio's audio boot <code>fetch()</code>es its engine and
 * worklet sources, which a <code>file://</code> origin cannot do, and an https origin is a
 * secure context, so the AudioWorklet path works exactly as it does on the site.
 *
 * <p>Nothing about playback logic is re-implemented. The page owns the sound; this class only
 * forwards state (to the service) and commands (to the page).
 */
public class MainActivity extends Activity {

    static final String TAG = "ResonanceStudio";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PAGE = "https://" + HOST + "/app/index.html";

    private static final int REQ_NOTIFICATIONS = 1001;
    private static final int REQ_FILE = 1002;

    /** The page owns playback; PlaybackService reaches it through this handle. */
    private static WeakReference<WebView> pageRef = new WeakReference<>(null);

    private WebView web;
    private String shim;
    private ViewGroup root;
    private ValueCallback<Uri[]> fileCallback;
    private SaveSession save;              // one file being written at a time, by design

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        askForNotificationPermission();

        root = new FrameLayout(this);
        setContentView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        if (!buildWeb()) {
            web = null;
            showNoWebView();
            return;
        }
        if (state == null) {
            web.loadUrl(PAGE);
        } else {
            web.restoreState(state);
        }
        pageRef = new WeakReference<>(web);
    }

    /** Build the WebView and its client. False when this device has no usable one. */
    private boolean buildWeb() {
        try {
            web = new WebView(this);
        } catch (Throwable t) {
            Log.w(TAG, "no usable WebView on this device: " + t);
            return false;
        }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            try { WebView.setWebContentsDebuggingEnabled(true); } catch (Throwable ignored) { }
        }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // imported packs + preferences live in localStorage
        s.setLoadsImagesAutomatically(true);
        /* The app leaves this off so the shell (lock screen, notification) can start a
           session without a tap. Devices whose WebView ignores it fall back to needing one. */
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setBackgroundColor(Color.parseColor("#0E0B09"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "ResonanceJs");
        web.setWebChromeClient(new Chrome());
        web.setWebViewClient(new WebViewClient() {

            /** Every asset request on the app's own origin is answered from the APK. */
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri u = request.getUrl();
                    if (u == null || !HOST.equals(u.getHost())) return null;
                    String path = u.getPath();
                    if (path == null || path.isEmpty() || path.equals("/")) path = "/app/index.html";
                    if (path.contains("..")) return notFound();
                    String asset = "www" + path;
                    InputStream in;
                    try {
                        in = getAssets().open(asset);
                    } catch (Exception missing) {
                        Log.w(TAG, "asset 404: " + asset);
                        return notFound();
                    }
                    String mime = mimeOf(asset);
                    Map<String, String> headers = new HashMap<>();
                    /* The assets are the app's own copy and change with every APK: never let
                       the WebView's HTTP cache answer for a previous version's file. */
                    headers.put("Cache-Control", "no-cache");
                    WebResourceResponse resp = new WebResourceResponse(mime, encodingOf(mime), in);
                    resp.setResponseHeaders(headers);
                    return resp;
                } catch (Exception e) {
                    Log.w(TAG, "intercept: " + e);
                    return null;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                try { view.getSettings().setMediaPlaybackRequiresUserGesture(false); } catch (Exception ignored) { }
                String js = shim();
                if (!js.isEmpty()) view.evaluateJavascript(js, null);
                Compat compat = Compat.get(MainActivity.this);
                if (compat != null) compat.maybeWarn(MainActivity.this);
                checkForUpdate(false);
            }

            /** This app is a single page: anything not on our own origin is for the browser. */
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://" + HOST + "/")) return false;
                openExternal(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    Log.w(TAG, "main frame failed: " + request.getUrl() + " - " + error.getDescription());
                }
            }

            /** Low-memory tablets kill the renderer, which takes the page and the audio with
             *  it. Rebuild rather than leaving a blank screen and a dead player. */
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                Log.w(TAG, "renderer gone (crashed=" + (detail == null ? "?" : detail.didCrash()) + ") - rebuilding");
                pageRef = new WeakReference<>(null);
                if (web != null) {
                    root.removeView(web);
                    try { web.destroy(); } catch (Exception ignored) { }
                    web = null;
                }
                if (buildWeb()) {
                    pageRef = new WeakReference<>(web);
                    web.loadUrl(PAGE);
                }
                return true;
            }
        });

        root.addView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return true;
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                Collections.<String, String>emptyMap(), null);
    }

    private static String mimeOf(String path) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(path);
        String mime = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
        if (mime != null) return mime;
        if (path.endsWith(".gnaural")) return "application/xml";
        return "application/octet-stream";
    }

    private static String encodingOf(String mime) {
        if (mime != null && (mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript")
                || mime.contains("xml") || mime.contains("svg"))) {
            return "utf-8";
        }
        return null;
    }

    /** The one thing this app cannot work without, so say it plainly rather than die. */
    private void showNoWebView() {
        TextView tv = new TextView(this);
        tv.setText(R.string.no_webview);
        tv.setTextSize(15);
        tv.setPadding(48, 96, 48, 48);
        tv.setBackgroundColor(Color.parseColor("#0E0B09"));
        tv.setTextColor(Color.parseColor("#F2E6D8"));
        root.addView(tv, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        pageRef = new WeakReference<>(null);
        super.onDestroy();
    }

    /** Open a link in whatever app the phone uses for it. App-internal URLs are refused. */
    private void openExternal(String url) {
        if (url == null || url.isEmpty()) return;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            Log.w(TAG, "refusing to open non-web url: " + url);
            return;
        }
        if (url.startsWith("https://" + HOST + "/") || url.startsWith("http://" + HOST + "/")) {
            Log.w(TAG, "refusing to open the app's own origin externally: " + url);
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "nothing can open " + url + ": " + e);
        }
    }

    /** Back leaves the fullscreen visualizer first (the shim pushes a history entry for it),
     *  then walks the app's own history. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** Run JS in the page on the UI thread. Used by the playback service. */
    static void pageCommand(final String js) {
        final WebView w = pageRef.get();
        if (w == null) return;
        w.post(new Runnable() {
            @Override
            public void run() {
                try {
                    w.evaluateJavascript(js, null);
                } catch (Exception ignored) {
                    // page torn down between the check and the call
                }
            }
        });
    }

    private String shim() {
        if (shim != null) return shim;
        try (InputStream in = getAssets().open("www/_shell_shim.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            shim = out.toString("UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "shim not loaded: " + e);
            shim = "";
        }
        return shim;
    }

    private void askForNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFICATIONS);
        }
    }

    /* ------------------------------------------------------------- file import ---- */

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] uris = null;
            if (result == RESULT_OK && data != null) {
                if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                } else if (data.getClipData() != null) {
                    ClipData c = data.getClipData();
                    uris = new Uri[c.getItemCount()];
                    for (int i = 0; i < c.getItemCount(); i++) uris[i] = c.getItemAt(i).getUri();
                }
            }
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, result, data);
    }

    /** The page has file inputs (open .gnaural, add pack .zip); a WebView shows no picker
     *  without this, which is the difference between "import works" and "the button does
     *  nothing". */
    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try {
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                String type = "*/*";
                String[] accept = params == null ? null : params.getAcceptTypes();
                if (accept != null) {
                    for (String a : accept) {
                        if (a == null || a.isEmpty()) continue;
                        /* .gnaural files are routinely typed as octet-stream by Android's
                           providers, so only the zip filter is safe to apply - a picker
                           filtered to application/xml would hide the .gnaural files. */
                        if (a.contains("zip")) { type = "application/zip"; break; }
                    }
                }
                pick.setType(type);
                startActivityForResult(Intent.createChooser(pick, "Open in Resonance Studio"), REQ_FILE);
                return true;
            } catch (Exception e) {
                Log.w(TAG, "file chooser: " + e);
                fileCallback = null;
                cb.onReceiveValue(null);
                return false;
            }
        }

        /* A WebView shows no JS dialogs by default. The only prompt the page can raise is
           the share-link copy fallback, so both are a plain dialog with selectable text. */
        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue,
                                  final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue == null ? "" : defaultValue);
            input.setSelectAllOnFocus(true);
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm(input.getText().toString()))
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }
    }

    /* ------------------------------------------------------------------- saves ---- */

    /**
     * One file write at a time (the page serialises its own saves, and the shell refuses a
     * second start so two streams can never interleave). Large exports (a 20-minute WAV is
     * ~200 MB) arrive here in chunks as base64 and are streamed straight to disk.
     */
    private final class SaveSession {
        private OutputStream out;
        private Uri uri;              // MediaStore, API 29+
        private File file;            // legacy / app-dir fallback
        String name;
        String location;              // for the toast after fileEnd()

        void abort() {
            try { if (out != null) out.close(); } catch (Exception ignored) { }
            if (uri != null) {
                try { getContentResolver().delete(uri, null, null); } catch (Exception ignored) { }
            }
            out = null; uri = null; file = null;
            save = null;
        }
    }

    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) name = "resonance-file";
        name = name.replace('\\', '_').replace('/', '_').replace(':', '_');
        StringBuilder b = new StringBuilder();
        for (char c : name.toCharArray()) {
            if (c >= 32 && c != 127) b.append(c);
        }
        String clean = b.toString().trim();
        if (clean.isEmpty()) clean = "resonance-file";
        if (clean.length() > 120) clean = clean.substring(0, 120);
        return clean;
    }

    /** Open a sink for the incoming bytes: MediaStore on Android 10+, a Downloads folder
     *  on older devices (public when permitted, app-owned otherwise - no permission prompts). */
    private SaveSession openSink(String rawName, String mime) {
        String name = safeName(rawName);
        if (mime == null || mime.trim().isEmpty()) mime = "application/octet-stream";
        SaveSession s = new SaveSession();
        s.name = name;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Resonance Studio");
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u == null) throw new IllegalStateException("MediaStore refused the insert");
                s.uri = u;
                s.out = getContentResolver().openOutputStream(u);
                if (s.out == null) throw new IllegalStateException("no stream from MediaStore");
                s.location = "Downloads/Resonance Studio/" + name;
            } else {
                File dir;
                if (checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE")
                        == PackageManager.PERMISSION_GRANTED) {
                    dir = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS), "Resonance Studio");
                    s.location = "Downloads/Resonance Studio/" + name;
                } else {
                    dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                            "Resonance Studio");
                    s.location = dir.getAbsolutePath() + "/" + name;
                }
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cannot make " + dir);
                s.file = new File(dir, name);
                s.out = new FileOutputStream(s.file);
            }
        } catch (Exception e) {
            Log.w(TAG, "openSink: " + e);
            s.abort();
            return null;
        }
        return s;
    }

    /* ------------------------------------------------------------------ bridge ---- */

    /** Receives state from the page and answers its requests. Public: WebView finds these
     *  methods by reflection, and a non-public class can fail that lookup. */
    public class Bridge {

        @JavascriptInterface
        public void state(boolean playing, String session, String error) {
            String label = (session == null || session.trim().isEmpty())
                    ? getString(R.string.app_name) : session.trim();
            Intent i = new Intent(MainActivity.this, PlaybackService.class);
            i.setAction(playing ? PlaybackService.ACTION_PLAYING : PlaybackService.ACTION_STOPPED);
            i.putExtra(PlaybackService.EXTRA_SESSION, label);
            try {
                if (playing) {
                    startForegroundService(i);
                } else {
                    startService(i);
                }
            } catch (Exception e) {
                Log.w(TAG, "service start refused: " + e);
            }
            if (error != null && !error.isEmpty()) {
                Log.i(TAG, "session error: " + error);
            }
        }

        @JavascriptInterface
        public void log(String message) {
            Log.i(TAG, "page: " + message);
        }

        /** A link the page wants opened properly (help pages, credits, moddys.net). */
        @JavascriptInterface
        public void url(final String address) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { openExternal(address); }
            });
        }

        /** Committing a search should put the keyboard away: on Android a blur alone often
         *  leaves the IME on screen, so the shell hides it for real. */
        @JavascriptInterface
        public void dismissKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        android.view.inputmethod.InputMethodManager imm =
                                (android.view.inputmethod.InputMethodManager)
                                        getSystemService(Context.INPUT_METHOD_SERVICE);
                        if (imm != null && web != null) {
                            imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
                        }
                        if (web != null) web.clearFocus();
                    } catch (Exception e) {
                        Log.w(TAG, "dismissKeyboard: " + e);
                    }
                }
            });
        }

        /** The share-link and report paths need the clipboard; the WebView will not grant
         *  the async Clipboard API on its own, so the shell owns the copy. */
        @JavascriptInterface
        public boolean copy(String text) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm == null) return false;
                cm.setPrimaryClip(ClipData.newPlainText("Resonance Studio", text == null ? "" : text));
                return true;
            } catch (Exception e) {
                Log.w(TAG, "copy: " + e);
                return false;
            }
        }

        /** Start a streamed save. False when one is already open or the sink refused. */
        @JavascriptInterface
        public boolean fileStart(String name, String mime) {
            if (save != null) {
                Log.w(TAG, "fileStart refused: a save is already open");
                return false;
            }
            SaveSession s = openSink(name, mime);
            if (s == null) return false;
            save = s;
            return true;
        }

        @JavascriptInterface
        public boolean fileChunk(String base64) {
            SaveSession s = save;
            if (s == null || s.out == null) return false;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                s.out.write(bytes);
                return true;
            } catch (Exception e) {
                Log.w(TAG, "fileChunk: " + e);
                s.abort();
                return false;
            }
        }

        /** Finish the save. Returns "ok:<where it went>" or "err:<why>". */
        @JavascriptInterface
        public String fileEnd() {
            SaveSession s = save;
            if (s == null) return "err:no save open";
            try {
                s.out.flush();
                s.out.close();
                String where = s.location;
                save = null;
                Log.i(TAG, "saved: " + where);
                return "ok:" + where;
            } catch (Exception e) {
                Log.w(TAG, "fileEnd: " + e);
                String where = s.location;
                s.abort();
                return "err:" + (where == null ? e : ("could not finish " + where));
            }
        }

        /** Save one of the APK's own assets (the pack zips) into Downloads. */
        @JavascriptInterface
        public String saveAsset(String assetPath, String name) {
            if (save != null) return "err:a save is already open";
            SaveSession s = null;
            try {
                InputStream in = getAssets().open(assetPath);
                s = openSink(name, "application/zip");
                if (s == null) { in.close(); return "err:cannot open the destination"; }
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) s.out.write(buf, 0, n);
                in.close();
                s.out.flush();
                s.out.close();
                String where = s.location;
                Log.i(TAG, "saved asset: " + assetPath + " -> " + where);
                return "ok:" + where;
            } catch (Exception e) {
                Log.w(TAG, "saveAsset: " + e);
                if (s != null) s.abort();
                return "err:" + e;
            }
        }

        /** Update now, from the shell's own notice. */
        @JavascriptInterface
        public void updateApp(final String url, final String version, final String sha256) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { Updates.downloadAndInstall(MainActivity.this, url, version, sha256); }
            });
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { checkForUpdate(true); }
            });
        }

        /** What the shell needs to describe this device in its own check panel. */
        @JavascriptInterface
        public String device() {
            JSONObject o = new JSONObject();
            try {
                Compat c = Compat.get(MainActivity.this);
                o.put("manufacturer", Build.MANUFACTURER);
                o.put("model", Build.MODEL);
                o.put("api", Build.VERSION.SDK_INT);
                o.put("release", Build.VERSION.RELEASE);
                o.put("app", versionName());
                o.put("webview", webViewVersion());
                o.put("engine", webViewVersion());
                o.put("engineLabel", "WebView");
                o.put("platform", "android");
                o.put("osName", "Android");
                o.put("notifications", notificationsGranted());
                o.put("density", String.valueOf(getResources().getDisplayMetrics().densityDpi));
                if (c != null) {
                    o.put("system", c.system());
                    o.put("compat", c.forPage(MainActivity.this));
                }
            } catch (Exception e) {
                Log.w(TAG, "device(): " + e);
            }
            return o.toString();
        }
    }

    private void checkForUpdate(boolean manual) {
        Updates.check(this, manual, new Updates.Callback() {
            @Override
            public void onResult(Updates.Info info, String error) {
                if (error != null) {
                    Log.i(TAG, "update check failed: " + error);
                    if (info == null) return;
                }
                String js;
                if (info != null && info.available) {
                    js = "window.__rsUpdate && window.__rsUpdate.available(" + info.json() + ")";
                } else {
                    js = "window.__rsUpdate && window.__rsUpdate.none("
                            + JSONObject.quote(info == null ? "" : info.version) + ")";
                }
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private String webViewVersion() {
        try {
            android.content.pm.PackageInfo p = WebView.getCurrentWebViewPackage();
            return p == null ? "unknown" : (p.packageName + " " + p.versionName);
        } catch (Throwable t) {
            return "unknown";
        }
    }

    private boolean notificationsGranted() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                   == PackageManager.PERMISSION_GRANTED;
    }
}
