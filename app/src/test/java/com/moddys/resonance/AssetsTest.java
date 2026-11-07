package com.moddys.resonance;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Build-integrity tests: no emulator, no device, milliseconds to run.
 *
 * These guard the seam that has actually broken before — a shipped asset disagreeing with
 * the build it is shipped in, and a stylesheet pointing at art that is not in the APK.
 * They are deliberately file-level so they cost nothing and can never be flaky.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class AssetsTest {

    /** Unit tests run with app/ as the working directory; walk up if that ever changes. */
    private static File moduleDir() {
        File d = new File(".").getAbsoluteFile();
        for (int i = 0; i < 4 && d != null; i++) {
            if (new File(d, "src/main/assets/www").isDirectory()) return d;
            d = d.getParentFile();
        }
        throw new IllegalStateException("cannot find src/main/assets/www from " + new File(".").getAbsolutePath());
    }

    private static String read(File f) throws IOException {
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void compatJsonParsesAndCarriesItsVersion() throws Exception {
        File f = new File(moduleDir(), "src/main/assets/www/compat.json");
        assertTrue("compat.json is missing from the assets", f.isFile());
        JSONObject o = new JSONObject(read(f));
        assertTrue("compat.json has no appVersion", o.has("appVersion"));
        assertFalse("compat.json appVersion is empty", o.optString("appVersion").trim().isEmpty());
    }

    /** The version the page reports must be the version the APK claims. */
    @Test
    public void compatVersionMatchesTheBuild() throws Exception {
        File dir = moduleDir();
        String gradle = read(new File(dir, "build.gradle"));
        Matcher m = Pattern.compile("versionName\\s+[\"']([^\"']+)[\"']").matcher(gradle);
        assertTrue("no versionName in build.gradle", m.find());
        String versionName = m.group(1);

        String reported = new JSONObject(read(new File(dir, "src/main/assets/www/compat.json")))
                .optString("appVersion");
        assertEquals("compat.json disagrees with the build's versionName", versionName, reported);
    }

    /**
     * Every ui/*.webp the shell references must exist. A missing file fails silently at
     * runtime (the control simply paints its background colour), which is how a missing
     * button face could ship unnoticed.
     */
    @Test
    public void everyReferencedUiAssetIsInTheApk() throws Exception {
        File dir = moduleDir();
        String shim = read(new File(dir, "src/main/assets/www/_shell_shim.js"));
        Matcher m = Pattern.compile("url\\(ui/([A-Za-z0-9._\\-]+\\.webp)\\)").matcher(shim);
        List<String> missing = new ArrayList<>();
        int seen = 0;
        while (m.find()) {
            seen++;
            File f = new File(dir, "src/main/assets/www/app/ui/" + m.group(1));
            if (!f.isFile()) missing.add(m.group(1));
        }
        assertTrue("the shell references no ui art at all", seen > 0);
        assertTrue("referenced but not packaged: " + missing, missing.isEmpty());
    }

    /** The transport art this build added must actually be there. */
    @Test
    public void theAmplifierTransportArtIsPresent() {
        File ui = new File(moduleDir(), "src/main/assets/www/app/ui");
        for (String n : new String[]{"amp-play.webp", "amp-pause.webp", "amp-stop.webp",
                "amp-vol-knob.webp", "amp-vol-track.webp"}) {
            File f = new File(ui, n);
            assertTrue(n + " is missing", f.isFile());
            assertTrue(n + " is empty", f.length() > 500);
        }
    }
}
