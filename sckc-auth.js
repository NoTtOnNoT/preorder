// Password verifier only; account data remains in the project's Realtime Database.
export function validCouncilAccount(account){
  return !!account && account.enabled===true && account.role==="pickup"
    && account.passwordAlgorithm==="PBKDF2-SHA256"
    && /^[a-f0-9]{32}$/i.test(account.passwordSalt||"")
    && /^[a-f0-9]{64}$/i.test(account.passwordHash||"")
    && Number.isInteger(account.passwordIterations) && account.passwordIterations>=100000 && account.passwordIterations<=1000000
    && Number.isInteger(account.credentialVersion) && account.credentialVersion>=1;
}
export async function verifyCouncilPassword(account,password){
  if(!validCouncilAccount(account)||typeof password!=="string"||password.length>256)return false;
  const crypto=globalThis.crypto;if(!crypto?.subtle)throw new Error("SECURE_CONTEXT_REQUIRED");
  const salt=Uint8Array.from(account.passwordSalt.match(/../g),pair=>parseInt(pair,16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:account.passwordIterations},key,256));
  const expected=Uint8Array.from(account.passwordHash.match(/../g),pair=>parseInt(pair,16));
  let difference=0;for(let i=0;i<bits.length;i++)difference|=bits[i]^expected[i];return difference===0;
}
