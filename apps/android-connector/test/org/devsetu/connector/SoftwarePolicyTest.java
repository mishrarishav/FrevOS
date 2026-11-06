package org.devsetu.connector;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import org.json.*;

/** Runs the actual platform-independent Android policy against shared-contract job fixtures. */
public final class SoftwarePolicyTest {
    public static void main(String[] args) throws Exception {
        JSONObject fixture=new JSONObject(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
        JSONArray cases=fixture.getJSONArray("cases");int passed=0;
        for(int i=0;i<cases.length();i++){
            JSONObject c=cases.getJSONObject(i);boolean accepted;
            try{
                AndroidSoftwarePolicy.validate(c.getJSONObject("job"),c.getJSONObject("identity"),c.getJSONObject("saved"),c.getJSONObject("current"),c.getBoolean("inventory"),c.getBoolean("controlConsent"),c.getLong("now"));accepted=true;
            }catch(Exception denied){accepted=false;}
            if(accepted!=c.getBoolean("expected"))throw new AssertionError("Android policy case failed: "+c.getString("name"));
            passed++;
        }
        System.out.println("Android software policy PASS: "+passed+" shared-contract fixtures; no Android runtime or service mutation.");
    }
}
