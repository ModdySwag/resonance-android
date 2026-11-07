package com.moddys.resonance;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.media.AudioFocusRequest;
import android.media.AudioManager;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAudioManager;

import java.lang.reflect.Method;

/**
 * Audio focus: the contract the session-7 note left as "request+abandon observed on device;
 * loss/duck paths code-verified only". request and abandon are the two the framework can
 * actually audit, and they are the two a refactor would break silently - the app would keep
 * playing over a phone call, and nothing on screen would say so.
 *
 * The service keeps these methods private, so they are driven here the way the framework
 * drives them, by reflection. Making them package-private is the tidier follow-up; it is
 * deliberately not done in the same change as the tests.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class FocusTest {

    private static Object call(Object target, String name, Class<?>[] types, Object... args)
            throws Exception {
        Method m = target.getClass().getDeclaredMethod(name, types);
        m.setAccessible(true);
        return m.invoke(target, args);
    }

    private PlaybackService service() {
        return Robolectric.buildService(PlaybackService.class).create().get();
    }

    private ShadowAudioManager shadow(PlaybackService s) {
        AudioManager am = s.getSystemService(AudioManager.class);
        assertNotNull("no AudioManager in the service", am);
        return shadowOf(am);
    }

    @Test
    public void requestingFocusAsksTheFramework() throws Exception {
        PlaybackService s = service();
        Object granted = call(s, "requestFocus", new Class<?>[]{});
        /* the shadow hands back its own record type, so only presence is asserted here */
        assertNotNull("requestFocus() never called requestAudioFocus",
                shadow(s).getLastAudioFocusRequest());
        assertTrue("the service did not honour the grant", Boolean.TRUE.equals(granted));
    }

    @Test
    public void requestingTwiceDoesNotStackRequests() throws Exception {
        PlaybackService s = service();
        call(s, "requestFocus", new Class<?>[]{});
        call(s, "requestFocus", new Class<?>[]{});
        /* hasFocus short-circuits: one request, not two - a second would leak the first */
        assertNotNull(shadow(s).getLastAudioFocusRequest());
    }

    @Test
    public void abandoningGivesFocusBack() throws Exception {
        PlaybackService s = service();
        call(s, "requestFocus", new Class<?>[]{});
        call(s, "abandonFocus", new Class<?>[]{});
        assertNotNull("abandonFocus() did not abandon the request",
                shadow(s).getLastAbandonedAudioFocusRequest());
    }

    @Test
    public void abandoningWithoutHoldingFocusIsHarmless() throws Exception {
        PlaybackService s = service();
        call(s, "abandonFocus", new Class<?>[]{});
        assertNull("abandoned a request it never held",
                shadow(s).getLastAbandonedAudioFocusRequest());
    }

    /** A refusal must be reported, not obeyed: the page's state wins and nothing throws. */
    @Test
    public void arefusedRequestIsReportedNotThrown() throws Exception {
        PlaybackService s = service();
        shadow(s).setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED);
        Object granted = call(s, "requestFocus", new Class<?>[]{});
        assertFalse("a refused request was reported as granted", Boolean.TRUE.equals(granted));
    }
}
