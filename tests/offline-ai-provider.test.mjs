import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../assistant/offline-ai-provider.js",import.meta.url),"utf8");
const {generateOfflineTutorAnswer,hasOfflineTutor}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("the optional local AI adapter reports no installed model instead of inventing an answer",async()=>{
  assert.equal(hasOfflineTutor(null),false);
  await assert.rejects(generateOfflineTutorAnswer({message:"Explain photosynthesis"},null),error=>
    error.code==="OFFLINE_MODEL_NOT_CONFIGURED" && /No on-device AI model is installed/.test(error.message));
});

test("the optional local AI adapter forwards supported context and returns a real model response",async()=>{
  let received;
  const provider={async generate(request){received=request;return "A response from the provided local model.";}};
  assert.equal(hasOfflineTutor(provider),true);
  assert.equal(await generateOfflineTutorAnswer({
    grade:10,language:"om",message:"Explain the idea",history:[{role:"user",content:"Earlier"}],imageDataUrl:"data:image/png;base64,AA==",
  },provider),"A response from the provided local model.");
  assert.equal(received.grade,10);assert.equal(received.language,"om");
  assert.equal(received.message,"Explain the idea");assert.equal(received.history.length,1);
  assert.equal(received.imageDataUrl,"data:image/png;base64,AA==");
});

test("the optional local AI adapter rejects empty and non-text responses",async()=>{
  await assert.rejects(generateOfflineTutorAnswer({message:"Question"},{generate:async()=>"   "}),error=>
    error.code==="OFFLINE_MODEL_EMPTY_RESPONSE");
  await assert.rejects(generateOfflineTutorAnswer({message:"Question"},{generate:async()=>({text:"not a string"})}),error=>
    error.code==="OFFLINE_MODEL_EMPTY_RESPONSE");
});
