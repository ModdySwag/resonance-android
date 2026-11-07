# The bridge is called from the page by name: R8 must keep every @JavascriptInterface
# method and the class that carries them.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes SourceFile,LineNumberTable
-keep class com.moddys.resonance.MainActivity$Bridge { *; }
# Readable crash reports; strip the rest.
-renamesourcefileattribute SourceFile
