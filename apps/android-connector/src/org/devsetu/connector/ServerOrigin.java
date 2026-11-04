package org.devsetu.connector;

import java.net.URI;

/** Configured once by the local user; never follows a redirect to another origin. */
public final class ServerOrigin {
    private ServerOrigin() {}

    public static String identityNamespace(String value) throws Exception {
        URI uri=new URI(value);
        if(uri.getHost()==null || uri.getRawUserInfo()!=null || uri.getRawQuery()!=null || uri.getRawFragment()!=null ||
            !((uri.getRawPath()==null)||uri.getRawPath().isEmpty()) || !("http".equals(uri.getScheme())||"https".equals(uri.getScheme())) ||
            !new URI(uri.getScheme(),null,uri.getHost().toLowerCase(java.util.Locale.ROOT),uri.getPort(),null,null,null).toASCIIString().equals(value))
            throw new Exception("Invalid discovery identity namespace.");
        return value;
    }

    public static String normalize(String input, boolean internalHttp) throws Exception {
        URI uri;
        try { uri = new URI(input.trim()); }
        catch (java.net.URISyntaxException invalid) { throw new Exception("Enter a valid DevSetu server origin without credentials, query or fragment."); }
        String host = uri.getHost();
        String scheme = uri.getScheme();
        if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null ||
                uri.getRawFragment() != null || (uri.getRawPath() != null &&
                !uri.getRawPath().isEmpty() && !uri.getRawPath().matches("(?:/|/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/?)")) ||
                uri.getPort() == 0 || uri.getPort() > 65535) {
            throw new Exception("Enter your DevSetu server URL with at most one entry prefix.");
        }
        if (!"https".equals(scheme)) {
            if (!"http".equals(scheme) || !internalHttp || !isPrivateIpv4(host)) {
                throw new Exception("Use HTTPS, or explicitly allow HTTP for a private IPv4 server.");
            }
        }
        String prefix = uri.getRawPath() == null ? "" : uri.getRawPath().replaceAll("/$", "");
        return new URI(scheme, null, host.toLowerCase(java.util.Locale.ROOT), uri.getPort(), prefix, null, null).toASCIIString();
    }

    private static boolean isPrivateIpv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] numbers = new int[4];
        try {
            for (int i = 0; i < 4; i++) {
                if (!parts[i].matches("0|[1-9][0-9]{0,2}")) return false;
                numbers[i] = Integer.parseInt(parts[i]);
                if (numbers[i] > 255) return false;
            }
        } catch (NumberFormatException error) { return false; }
        return numbers[0] == 10 || numbers[0] == 127 ||
                (numbers[0] == 192 && numbers[1] == 168) ||
                (numbers[0] == 172 && numbers[1] >= 16 && numbers[1] <= 31);
    }
}
