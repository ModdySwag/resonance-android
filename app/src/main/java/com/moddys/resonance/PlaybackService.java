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
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

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
 * <p><b>It holds audio focus for the session.</b> Playback is reported as playing only after
 * {@link AudioManager#AUDIOFOCUS_GAIN} has been requested with an {@link AudioFocusRequest}
 * (minSdk is 26, so there is no pre-26 path to keep), and the request is abandoned when the
 * session stops. {@code AUDIOFOCUS_LOSS} pauses the page and {@code AUDIOFOCUS_LOSS_TRANSIENT}
 * pauses then resumes on {@code AUDIOFOCUS_GAIN}; {@code AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK}
 * pulls the media stream down instead of stopping. The sound itself is synthesised inside the
 * WebView's WebAudio graph, which exposes no gain to Java, so ducking is done on the stream
 * volume and the previous index is restored afterwards.
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
    private static final String TAG = "ResonanceStudio";

    /** How far the media stream is pulled down while another app asks us to duck. */
    private static final float DUCK_FRACTION = 0.2f;

    private MediaSession session;
    private PowerManager.WakeLock wake;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private boolean hasFocus;
    private boolean pausedForFocus;   // paused because focus went away, not because a person asked
    private int duckFrom = -1;        // stream index before a duck, -1 when not ducked
    private int duckTo = -1;          // the index the duck set, to tell a user change from ours
    private String title;
    private String pauseText;         // non-null while sitting in the paused state
    private boolean foreground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        title = getString(R.string.app_name);
        audio = getSystemService(AudioManager.class);

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
                requestFocus();                 // the session may only play while it holds focus
                tellPage("play");
                showPlaying();
            }

            @Override
            public void onPause() {
                pausedForFocus = false;         // a person asked for this one
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
            pausedForFocus = false;                 // a person asked for this one
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
            requestFocus();                         // before the page is told to make a sound
            tellPage("play");
            showPlaying();
            return START_NOT_STICKY;
        }
        if (ACTION_STOPPED.equals(action)) {
            pausedForFocus = false;                 // the page stopped itself
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
        abandonFocus();
        releaseWake();
        stopForegroundCompat();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        abandonFocus();
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
        abandonFocus();
        releaseWake();
        pauseText = null;
        pausedForFocus = false;
        setPlaybackState(PlaybackState.STATE_STOPPED);
        stopForegroundCompat();
        stopSelf();
    }

    private void showPlaying() {
        pauseText = null;
        pausedForFocus = false;
        session.setMetadata(metadata(getString(R.string.notification_tagline)));
        /* Unchanged order: the notification first (the foreground clock starts here, whatever
           focus does), then focus before the state claims to be playing. */
        startForegroundCompat();
        requestFocus();
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

    /* ------------------------------------------------------------- audio focus ---- */

    /**
     * Take the media focus before this session is reported as playing.
     *
     * <p>minSdk is 26, so {@link AudioFocusRequest} is the only path; the deprecated
     * {@code requestAudioFocus(listener, streamType, durationHint)} overload is never needed.
     * The request is refused (logged) rather than obeyed: the sound is already coming out of
     * the WebView by the time the page reports it, and leaving the notification on "paused"
     * while the speakers play would be the worse lie.
     */
    private boolean requestFocus() {
        if (audio == null) audio = getSystemService(AudioManager.class);
        if (audio == null) return false;
        if (focus == null) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(ATTRS)
                    /* Ducking is ours to do: the framework would otherwise pause us on a
                       can-duck loss, and the page resumes better from our own duck. */
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener(new AudioManager.OnAudioFocusChangeListener() {
                        @Override
                        public void onAudioFocusChange(int change) {
                            handleFocusChange(change);
                        }
                    })
                    .build();
        }
        if (hasFocus) return true;
        hasFocus = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (!hasFocus) Log.w(TAG, "audio focus refused; reporting the page's state anyway");
        return hasFocus;
    }

    private void abandonFocus() {
        unduck();
        if (hasFocus && audio != null && focus != null) {
            try {
                audio.abandonAudioFocusRequest(focus);
            } catch (Exception e) {
                Log.w(TAG, "abandon focus: " + e);
            }
        }
        hasFocus = false;
    }

    /**
     * The framework's verdict on who may use the speakers. Called on the main thread (the
     * listener was built on it), so the notification and the page command are safe here.
     */
    private void handleFocusChange(int change) {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS:
                /* Gone until we ask again - a call, another player, the assistant. Drop the
                   request instead of sitting on one we no longer hold. */
                hasFocus = false;
                if (audio != null && focus != null) {
                    try { audio.abandonAudioFocusRequest(focus); } catch (Exception e) { }
                }
                unduck();
                pausedForFocus = true;
                tellPage("pause");
                showPaused(getString(R.string.notification_paused));
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                /* Someone needs the speakers for a moment and is giving them back: pause but
                   keep the request, so AUDIOFOCUS_GAIN can resume where the person was. */
                pausedForFocus = true;
                tellPage("pause");
                showPaused(getString(R.string.notification_paused));
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                duck();
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                unduck();
                if (pausedForFocus) {                    // only resume what we paused
                    tellPage("play");
                    showPlaying();
                }
                break;
            default:
                break;
        }
    }

    /**
     * Pull our own output down without stopping it.
     *
     * <p>The page synthesises in a WebAudio graph inside the WebView; the graph exposes no gain
     * node to Java, so the media stream is the only attenuation this service can apply. The
     * previous index is remembered and only put back if the ducked level is still the one we
     * set - a person who moves the volume during the duck meant it.
     */
    private void duck() {
        if (audio == null || duckFrom >= 0) return;
        try {
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int now = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            int target = Math.max(1, Math.round(max * DUCK_FRACTION));
            if (now <= target) return;                   // already quieter than the duck
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
            duckFrom = now;
            duckTo = target;
        } catch (Exception e) {
            Log.w(TAG, "duck: " + e);
            duckFrom = duckTo = -1;
        }
    }

    private void unduck() {
        int from = duckFrom, to = duckTo;
        duckFrom = duckTo = -1;
        if (from < 0 || audio == null) return;
        try {
            if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == to) {
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, from, 0);
            }
        } catch (Exception e) {
            Log.w(TAG, "unduck: " + e);
        }
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
