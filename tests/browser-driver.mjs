import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";

export async function browserDriver() {
  const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const profile=await mkdtemp(join(tmpdir(),"mina-learning-browser-"));
  const child=spawn(process.env.CHROMIUM_PATH || "chromium",["--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--disable-background-networking",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
  let startupError;child.on("error",error=>{startupError=error;});
  const debug=`http://127.0.0.1:${port}`;
  let socket,tab;
  try {
    const deadline=Date.now()+15000;
    while(true) {
      if(startupError)throw startupError;
      try {tab=await fetch(`${debug}/json/new?about:blank`,{method:"PUT"}).then(response=>response.json());break;}
      catch(error){if(Date.now()>deadline)throw new Error(`Chromium did not start: ${error.message}`);await new Promise(resolve=>setTimeout(resolve,100));}
    }
    socket=new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
    const pending=new Map(),exceptions=[],requests=[],responses=[];let sequence=0,interceptor;
    const command=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Browser command timed out: ${method}`));},20000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    socket.addEventListener("message",event=>{
      const message=JSON.parse(event.data);
      if(message.id) {
        const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);
        if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
      } else if(message.method==="Runtime.exceptionThrown")exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      else if(message.method==="Network.requestWillBeSent")requests.push(message.params.request.url);
      else if(message.method==="Network.responseReceived")responses.push({url:message.params.response.url,status:message.params.response.status});
      else if(message.method==="Fetch.requestPaused") {
        Promise.resolve(interceptor?.(message.params.request)).then(result=>result
          ? command("Fetch.fulfillRequest",{requestId:message.params.requestId,responseCode:result.status || 200,responseHeaders:[{name:"Content-Type",value:"application/json"}],body:Buffer.from(JSON.stringify(result.body)).toString("base64")})
          : command("Fetch.continueRequest",{requestId:message.params.requestId})).catch(error=>exceptions.push(error.message));
      }
    });
    const evaluate=async expression=>{
      const result=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor=async expression=>{
      const deadline=Date.now()+15000;
      while(Date.now()<deadline) {if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}
      throw new Error(`Timed out: ${expression}\n${await evaluate("document.body.innerText.slice(0,1500)")}`);
    };
    await command("Page.enable");await command("Runtime.enable");await command("Network.enable");
    return {command,evaluate,waitFor,requests,exceptions,responses,
      async intercept(handler,patterns=["*api/learning/*"]) {interceptor=handler;await command("Fetch.enable",{patterns:patterns.map(urlPattern=>({urlPattern,requestStage:"Request"}))});},
      async stopIntercept(){await command("Fetch.disable");interceptor=null;},
      async close(){
        await fetch(`${debug}/json/close/${tab.id}`).catch(()=>{});socket.close();child.kill("SIGTERM");
        await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once("exit",resolve);setTimeout(()=>{child.kill("SIGKILL");resolve();},2000).unref();});
        // Chromium subprocesses may finish their last profile writes just after the parent exits.
        await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
      }};
  } catch(error) {socket?.close();child.kill("SIGKILL");throw error;}
}
