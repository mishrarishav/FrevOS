package org.devsetu.connector;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Deliberate, same-browser loopback confirmation; never exposes the connector credential. */
final class LoginProofServer implements AutoCloseable {
    private final ConnectorApi api;
    private final String credential;
    private final ServerSocket listener;
    private final ExecutorService acceptor=Executors.newSingleThreadExecutor();
    private final ThreadPoolExecutor clients=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(4));
    private final Map<String,Long> pages=new ConcurrentHashMap<>();
    private final Set<Socket> sockets=ConcurrentHashMap.newKeySet();
    LoginProofServer(ConnectorApi api,String credential) throws Exception {
        this.api=api; this.credential=credential;
        listener=new ServerSocket(0,4,InetAddress.getByName("127.0.0.1"));
        if (listener.getLocalPort()<1024) { listener.close(); throw new Exception("Local confirmation port is unavailable."); }
    }
    int port() { return listener.getLocalPort(); }
    void start() {
        acceptor.execute(() -> {
            while(!listener.isClosed()) {
                try { Socket socket=listener.accept(); socket.setSoTimeout(4000); sockets.add(socket); try { clients.execute(() -> serve(socket)); } catch(RejectedExecutionException full) { sockets.remove(socket); socket.close(); } }
                catch(IOException closed) { if (!listener.isClosed()) close(); }
            }
        });
    }
    private String line(InputStream input) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream(); int value;
        while((value=input.read())!=-1) { if(value==10) break; if(value!=13) out.write(value); if(out.size()>2048) throw new IOException("header limit"); }
        return out.toString("US-ASCII");
    }
    private void serve(Socket socket) {
        try(Socket client=socket) {
            if(!"127.0.0.1".equals(client.getInetAddress().getHostAddress())) return;
            InputStream input=client.getInputStream(); String request=line(input);
            Map<String,String> headers=new HashMap<>();
            for(int i=0;i<32;i++) { String line=line(input); if(line.isEmpty()) break; int colon=line.indexOf(':'); if(colon<1) throw new IOException("header"); String key=line.substring(0,colon).trim().toLowerCase(Locale.ROOT); if(headers.put(key,line.substring(colon+1).trim())!=null) throw new IOException("duplicate header"); }
            if(!("127.0.0.1:"+port()).equals(headers.get("host")) || headers.containsKey("transfer-encoding")) { respond(client,403,"text/plain","Denied",""); return; }
            long now=System.currentTimeMillis(); pages.entrySet().removeIf(entry -> entry.getValue()<=now);
            if(request.equals("GET /device-login/start HTTP/1.1")) {
                if(pages.size()>=32) { respond(client,429,"text/plain","Retry later",""); return; }
                String nonce=ConnectorApi.secret(); pages.put(nonce,now+120000);
                String page="<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>DevSetu confirmation</title><h1>Confirm this Android device</h1><p>Continue only if you just signed in at <strong></strong>.</p><button id='confirm'>Confirm sign-in from this device</button><p id='message'></p><script nonce='"+nonce+"'>const transaction=location.hash.slice(1),target="+JSONObject.quote(api.origin)+",button=document.getElementById('confirm');document.querySelector('strong').textContent=target;history.replaceState(null,'','/device-login/start');button.onclick=async()=>{button.disabled=true;try{if(!/^dl_[a-f0-9]{64}$/.test(transaction))throw Error();const r=await fetch('/device-login/confirm',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-devsetu-page':"+JSONObject.quote(nonce)+"},body:JSON.stringify({version:1,challengeId:transaction})});if(!r.ok)throw Error();const proof=await r.json(),form=document.createElement('form');form.method='POST';form.action=target+'/auth/device-login/receive';for(const key of ['version','challengeId','proof']){const field=document.createElement('input');field.type='hidden';field.name=key;field.value=String(proof[key]);form.append(field)}document.body.append(form);form.submit()}catch{document.getElementById('message').textContent='Verification failed or expired. Return to DevSetu and retry from this paired device.';button.disabled=false}}</script>";
                String extra="Set-Cookie: devsetu-proof-page="+nonce+"; Path=/device-login; HttpOnly; SameSite=Strict; Max-Age=120\r\nContent-Security-Policy: default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'self'; form-action "+api.origin+"/auth/device-login/receive; frame-ancestors 'none'; base-uri 'none'\r\n";
                respond(client,200,"text/html; charset=utf-8",page,extra); return;
            }
            String nonce=headers.get("x-devsetu-page");
            boolean cookie=Arrays.stream(headers.getOrDefault("cookie","").split(";")).anyMatch(part -> part.trim().equals("devsetu-proof-page="+nonce));
            Long expires=nonce==null?null:pages.remove(nonce);
            if(!request.equals("POST /device-login/confirm HTTP/1.1") || !("http://127.0.0.1:"+port()).equals(headers.get("origin")) ||
                    !headers.getOrDefault("content-type","").startsWith("application/json") || !cookie || expires==null || expires<=now) {
                respond(client,403,"text/plain","Denied",""); return;
            }
            int length=Integer.parseInt(headers.getOrDefault("content-length","0"));
            if(length<1 || length>2048) throw new IOException("body limit");
            byte[] body=new byte[length]; int count=0;
            while(count<length) { int read=input.read(body,count,length-count); if(read<0) throw new IOException("body"); count+=read; }
            JSONObject challenge=new JSONObject(new String(body,StandardCharsets.UTF_8));
            if(challenge.length()!=2 || challenge.getInt("version")!=1 || !challenge.getString("challengeId").matches("dl_[a-f0-9]{64}")) throw new IOException("challenge");
            JSONObject proof=api.post("/v1/connector/login-proof",challenge,credential);
            if(proof.getInt("version")!=1 || !challenge.getString("challengeId").equals(proof.getString("challengeId")) || !proof.getString("proof").matches("[a-f0-9]{64}")) throw new IOException("proof");
            respond(client,200,"application/json",proof.toString(),"Set-Cookie: devsetu-proof-page=; Path=/device-login; HttpOnly; SameSite=Strict; Max-Age=0\r\n");
        } catch(Exception denied) { /* Close without bodies, credentials, URLs or exception logging. */ }
        finally { sockets.remove(socket); }
    }
    private void respond(Socket socket,int status,String type,String body,String extra) throws IOException {
        byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
        String headers="HTTP/1.1 "+status+" Result\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: origin\r\nX-Content-Type-Options: nosniff\r\n"+extra+"\r\n";
        OutputStream output=socket.getOutputStream(); output.write(headers.getBytes(StandardCharsets.US_ASCII)); output.write(bytes); output.flush();
    }
    @Override public void close() { try { listener.close(); } catch(IOException ignored) {} acceptor.shutdownNow(); clients.shutdownNow(); for(Socket socket:sockets) { try { socket.close(); } catch(IOException ignored) {} } sockets.clear(); pages.clear(); }
}
