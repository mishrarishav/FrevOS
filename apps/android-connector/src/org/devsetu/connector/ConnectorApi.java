package org.devsetu.connector;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import android.os.Build;
import android.util.Base64;
import org.json.JSONObject;

final class ConnectorApi {
    final String origin;
    ConnectorApi(String origin, boolean internalHttp) throws Exception {
        this.origin = ServerOrigin.normalize(origin, internalHttp);
    }
    static String hash(String text) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
    static String secret() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.NO_WRAP | Base64.NO_PADDING | Base64.URL_SAFE);
    }
    static String installationId(android.content.Context context, String origin) throws Exception {
        String scoped = null;
        try { scoped = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID); }
        catch (SecurityException unavailable) { /* Managed devices may hide the ID. Use the persisted random fallback. */ }
        if (scoped != null && scoped.matches("[a-fA-F0-9]{16}") && !scoped.matches("0+")) {
            // Android already scopes this value to signing key, Android user and
            // device. Send only an additional server-scoped hash, never the raw ID.
            return hash("devsetu-android-v1:" + origin + ":" + scoped.toLowerCase(java.util.Locale.ROOT));
        }
        return hash(secret()); // Persisted with this pairing when the OS has no reliable identifier.
    }
    static String architecture() throws Exception {
        for (String abi : Build.SUPPORTED_ABIS) {
            if (abi.equals("arm64-v8a")) return "arm64";
            if (abi.equals("x86_64")) return "x64";
        }
        throw new Exception("This release needs a 64-bit Android device (ARM64 or x64).");
    }
    JSONObject post(String route, JSONObject body, String credential) throws Exception {
        if (!route.matches("/(?:v1/connector|auth)/[a-z0-9/-]+")) throw new Exception("Unsupported request.");
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + route).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            if (credential != null) connection.setRequestProperty("Authorization", "Bearer " + credential);
            byte[] request = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(request.length);
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(request); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                if (status == 401 || status == 403) throw new AccessDenied();
                throw new Exception("Server did not accept the request (HTTP " + status + "). Check the code, approval and VPN.");
            }
            ByteArrayOutputStream result = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (result.size() + count > 65536) throw new Exception("Server response exceeds the allowed size.");
                    result.write(buffer, 0, count);
                }
            }
            try { return new JSONObject(result.toString("UTF-8")); }
            catch (org.json.JSONException invalid) { throw new Exception("Server returned an unrecognized reply. Check the DevSetu URL and try again."); }
        } finally { connection.disconnect(); }
    }
    static final class AccessDenied extends Exception {
        AccessDenied() { super("Connection is not authorized. Check approval or contact your administrator."); }
    }
}
