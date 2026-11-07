package com.moddys.resonance;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.ClipboardManager;
import android.content.Context;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * The bridge the page talks to. Nothing here needs a device: the methods are Java, the
 * WebView is never involved, and these are the calls a bad refactor would break silently
 * (the page can only discover a broken bridge by a feature quietly doing nothing).
 *
 * Only create() is used, not setup(): start/resume would start the playback service and
 * the point of these tests is the bridge surface, not the service lifecycle.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class BridgeTest {

    private MainActivity.Bridge bridge() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().get();
        assertNotNull("the activity did not build", a);
        MainActivity.Bridge b = a.new Bridge();
        assertNotNull(b);
        return b;
    }

    @Test
    public void deviceFactsAreReportedToThePage() {
        String d = bridge().device();
        assertNotNull("device() returned null", d);
        assertFalse("device() returned an empty string", d.trim().isEmpty());
        assertTrue("device() does not look like JSON: " + d, d.trim().startsWith("{"));
    }

    @Test
    public void paletteIsAlwaysAnswerable() {
        String p = bridge().palette();
        assertNotNull("palette() returned null", p);
        assertFalse("palette() returned empty", p.trim().isEmpty());
    }

    /** Copy is the export path for a session or a log; a false here is a silent no-op. */
    @Test
    public void copyPutsTheTextOnTheClipboard() {
        MainActivity.Bridge b = bridge();
        String text = "resonance-bridge-clipboard-probe";
        assertTrue("copy() refused", b.copy(text));

        Activity a = Robolectric.buildActivity(MainActivity.class).create().get();
        ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
        assertNotNull(cm);
        assertNotNull(cm.getPrimaryClip());
        String got = cm.getPrimaryClip().getItemAt(0).coerceToText(a).toString();
        assertTrue("clipboard does not hold the copied text: " + got, got.contains(text));
    }

    /** log() is what the shell calls on every page error; it must never throw. */
    @Test
    public void logAcceptsAnything() {
        MainActivity.Bridge b = bridge();
        b.log("bridge test line");
        b.log(null);
        b.log("");
    }
}
