package pl.tsubasa.offline.preview;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Offline WebView host. All HTTPS asset requests are served from this APK. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        web = new WebView(this);
        web.setBackgroundColor(0xff000000);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                Log.println(m.messageLevel() == ConsoleMessage.MessageLevel.ERROR ? Log.ERROR : Log.INFO,
                    "TsubasaWeb", m.message() + " [" + m.sourceId() + ":" + m.lineNumber() + "]");
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                return !local(r.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest r) {
                return asset(r);
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private WebResourceResponse asset(WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!local(uri)) return error(403, "Forbidden");
        String file = uri.getPath().substring("/assets/".length());
        if (file.contains("\\") || file.indexOf('\0') >= 0) return error(403, "Forbidden");
        for (String segment : file.split("/")) if ("..".equals(segment)) return error(403, "Forbidden");
        InputStream stream = null;
        try {
            stream = getAssets().open(file);
            long total = stream.available(); // AssetInputStream reports remaining asset bytes.
            long first = 0, last = total - 1;
            String range = null;
            for (Map.Entry<String,String> h : request.getRequestHeaders().entrySet())
                if ("range".equalsIgnoreCase(h.getKey())) range = h.getValue();
            int status = 200;
            if (range != null) {
                if (!range.matches("bytes=\\d*-\\d*")) { stream.close(); return error(416, "Range Not Satisfiable"); }
                String[] limits = range.substring(6).split("-", -1);
                if (limits[0].isEmpty()) {
                    long suffix = Long.parseLong(limits[1]);
                    if (suffix <= 0) { stream.close(); return error(416, "Range Not Satisfiable"); }
                    first = Math.max(0, total - suffix);
                } else {
                    first = Long.parseLong(limits[0]);
                    if (!limits[1].isEmpty()) last = Math.min(last, Long.parseLong(limits[1]));
                }
                if (first > last || first >= total) { stream.close(); return error(416, "Range Not Satisfiable"); }
                long left = first;
                while (left > 0) {
                    long skipped = stream.skip(left);
                    if (skipped == 0) { if (stream.read() < 0) throw new IOException("Unexpected EOF"); skipped = 1; }
                    left -= skipped;
                }
                status = 206;
            }
            Map<String,String> headers = new HashMap<>();
            headers.put("Content-Length", Long.toString(last - first + 1));
            headers.put("Accept-Ranges", "bytes");
            if (status == 206) headers.put("Content-Range", "bytes " + first + "-" + last + "/" + total);
            InputStream body = new BoundedStream(stream, last - first + 1);
            return new WebResourceResponse(mime(file), null, status, status == 206 ? "Partial Content" : "OK", headers, body);
        } catch (Exception e) {
            if (stream != null) try { stream.close(); } catch (IOException ignored) {}
            Log.w("TsubasaAssets", "Could not load " + file, e);
            return error(404, "Not Found");
        }
    }

    private static WebResourceResponse error(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
            new HashMap<String,String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": return "text/html";
            case "js": return "application/javascript";
            case "json": return "application/json";
            case "css": return "text/css";
            case "wasm": return "application/wasm";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "ogg": return "audio/ogg";
            case "mp3": return "audio/mpeg";
            case "m4a": return "audio/mp4";
            case "wav": return "audio/wav";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            default: return "application/octet-stream";
        }
    }

    private static final class BoundedStream extends InputStream {
        private final InputStream source; private long remaining;
        BoundedStream(InputStream source, long remaining) { this.source=source; this.remaining=remaining; }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int n=source.read(); if(n >= 0) remaining--; return n;
        }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (len == 0) return 0;
            if (remaining <= 0) return -1;
            int n=source.read(b,off,(int)Math.min(len,remaining)); if(n>0) remaining-=n; return n;
        }
        @Override public void close() throws IOException { source.close(); }
    }

    @Override protected void onPause() { if(web!=null) { web.onPause(); web.pauseTimers(); } super.onPause(); }
    @Override protected void onResume() { super.onResume(); if(web!=null) { web.onResume(); web.resumeTimers(); } }
    @Override public void onBackPressed() {
        new AlertDialog.Builder(this).setTitle("Exit game?")
            .setMessage("Save your progress in the game before leaving.")
            .setPositiveButton("Exit", (dialog, which) -> finish())
            .setNegativeButton("Stay", null).show();
    }
    @Override protected void onDestroy() { if(web!=null) { web.destroy(); web=null; } super.onDestroy(); }
}
