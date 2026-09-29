package com.moddys.resonance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps a session alive while the app is backgrounded or the screen is off, and owns the
 * notification plus lock-screen controls.
 *
 * <p>Why a service at all: Android kills a backgrounded app, and when the process dies the
 * WebView (and therefore the sound) dies with it. Running as a mediaPlayback foreground
 * service is what makes "leave the app, keep listening" actually work. The page synthesises
 * the audio; this class never touches it, forwards commands and prints the state the page
 * reports.
 *
 * <p><b>It asks for no audio focus.</b> The WebView's engine (Chromium) requests focus for
 * the audio it plays, as any media app does. A second request from this service would make
 * one app look like two clients, and the framework reports the resulting shuffle back as a
 * loss or a refusal about this app's own audio. So the service stays out of it - the same
 * design the World Radio app settled on after three releases of learning it the hard way.
 *
 * <p>Pause keeps the notification (with Play) - a session that is paused is exactly when the
 * user wants that button. Stop tears the notification down. And a state the page reports on
 * its own (session finished, paused in the app) lands on the paused notification, never on a
 * claim about why it stopped.
 */
public class PlaybackService extends Service {

    static final String ACTION_PLAYING = "com.moddys.resonance.action.PLAYING";
    static final String ACTION_STOPPED = "com.moddys.resonance.action.STOPPED";
    static final String ACTION_PAUSE = "com.moddys.resonance.action.PAUSE";
    static final String ACTION_STOP = "com.moddys.resonance.action.STOP";
    static final String ACTION_RESUME = "com.moddys.resonance.action.RESUME";
    static final String EXTRA_SESSION = "session";

    private static final AudioAttributes ATTRS = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 4230;
    private static final long WAKE_TIMEOUT_MS = 12L * 60L * 60L * 1000L;

    private MediaSession session;
    private PowerManager.WakeLock wake;
    private String title;
    private String pauseText;         // non-null while sitting in the paused state
    private boolean foreground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        title = getString(R.string.app_name);

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.channel_desc));
        channel.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);

        session = new MediaSession(this, "ResonanceStudio");
        session.setPlaybackToLocal(ATTRS);
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                tellPage("play");
                showPlaying();
            }

            @Override
            public void onPause() {
                tellPage("pause");
                showPaused(getString(R.string.notification_paused));
            }

            @Override
            public void onStop() {
                tellPage("stop");
                teardown();
            }
        });
        session.setActive(true);

        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ResonanceStudio:session");
            wake.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = (intent == null) ? null : intent.getAction();

        if (ACTION_PAUSE.equals(action)) {
            tellPage("pause");
            showPaused(getString(R.string.notification_paused));
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            tellPage("stop");
            teardown();
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            tellPage("play");
            showPlaying();
            return START_NOT_STICKY;
        }
        if (ACTION_STOPPED.equals(action)) {
            showPaused(getString(R.string.notification_paused));
            return START_NOT_STICKY;
        }
        if (ACTION_PLAYING.equals(action)) {
            String s = intent.getStringExtra(EXTRA_SESSION);
            if (s != null && !s.trim().isEmpty()) title = s.trim();
            showPlaying();
            return START_NOT_STICKY;
        }

        // Nothing is playing (e.g. a restart with no intent): no empty notification,
        // no stray wake lock.
        stopSelf();
        return START_NOT_STICKY;
    }

    /** Swiping the app away kills its WebView, so the notification must go with it. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        releaseWake();
        stopForegroundCompat();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseWake();
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /* ------------------------------------------------------------------ states ---- */

    private void teardown() {
        releaseWake();
        pauseText = null;
        setPlaybackState(PlaybackState.STATE_STOPPED);
        stopForegroundCompat();
        stopSelf();
    }

    private void showPlaying() {
        pauseText = null;
        session.setMetadata(metadata(getString(R.string.notification_tagline)));
        startForegroundCompat();
        acquireWake();
        setPlaybackState(PlaybackState.STATE_PLAYING);
    }

    /**
     * Keep the notification, drop the sound. A paused or finished session must not make the
     * player vanish: the user still needs the way back, and this is it.
     */
    private void showPaused(String why) {
        pauseText = why;
        releaseWake();                              // nothing is playing, so nothing to keep awake
        session.setMetadata(metadata(why));
        startForegroundCompat();
        setPlaybackState(PlaybackState.STATE_PAUSED);
    }

    private MediaMetadata metadata(String subtitle) {
        return new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .build();
    }

    private void tellPage(String method) {
        MainActivity.pageCommand("window.__rs&&window.__rs." + method + "()");
    }

    private void setPlaybackState(int state) {
        long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_STOP;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build());
    }

    private void startForegroundCompat() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        foreground = true;
    }

    private void stopForegroundCompat() {
        if (foreground) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
            foreground = false;
        }
    }

    private Notification buildNotification() {
        boolean paused = pauseText != null;

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent content = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        PendingIntent primary = PendingIntent.getService(this, 1,
                new Intent(this, PlaybackService.class).setAction(paused ? ACTION_RESUME : ACTION_PAUSE),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stopAll = PendingIntent.getService(this, 2,
                new Intent(this, PlaybackService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Action primaryAction = new Notification.Action.Builder(
                Icon.createWithResource(this, paused ? R.drawable.ic_play : R.drawable.ic_pause),
                paused ? "Play" : "Pause", primary).build();
        Notification.Action stopAction = new Notification.Action.Builder(
                Icon.createWithResource(this, R.drawable.ic_stop), "Stop", stopAll).build();

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_note)
                .setContentTitle(title)
                .setContentText(paused ? pauseText : getString(R.string.notification_tagline))
                .setContentIntent(content)
                /* A paused session should be dismissible: swiping it away stops it. While it
                   is actually playing the notification stays put, as a playing player does. */
                .setOngoing(!paused)
                .setDeleteIntent(stopAll)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1))
                .addAction(primaryAction)
                .addAction(stopAction)
                .build();
    }

    private void acquireWake() {
        if (wake != null && !wake.isHeld()) {
            wake.acquire(WAKE_TIMEOUT_MS);
        }
    }

    private void releaseWake() {
        if (wake != null && wake.isHeld()) {
            wake.release();
        }
    }
}
