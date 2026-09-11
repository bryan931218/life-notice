const fs=require('fs');
function writeIfChanged(path,next){const old=fs.readFileSync(path,'utf8');if(old!==next)fs.writeFileSync(path,next)}
function mustReplace(text,oldValue,newValue,label){if(text.includes(newValue))return text;if(!text.includes(oldValue))throw new Error(`gmail cleanup migration: missing ${label}`);return text.replace(oldValue,newValue)}

let services=fs.readFileSync('src/services.ts','utf8');
services=mustReplace(services,
  "import {gmailNotificationPolicy} from './gmail-filter';",
  "import {GMAIL_PACKAGE,gmailNotificationPolicy} from './gmail-filter';",
  'Gmail package import');
services=mustReplace(services,
  "  const filtered=restored.filter(n=>!AUTO_SOURCE.test(n.source)||!isObviousNoiseText(`${n.title}\\n${n.source}`));",
  "  const filtered=restored.filter(n=>{if(!AUTO_SOURCE.test(n.source))return true;const text=`${n.title}\\n${n.source}`;if(isObviousNoiseText(text))return false;const fromGmail=/｜Gmail\\]/i.test(n.source);return !fromGmail||gmailNotificationPolicy(GMAIL_PACKAGE,n.title,n.source)!=='ignore';});",
  'old Gmail false-positive cleanup');
writeIfChanged('src/services.ts',services);
console.log('v1.5.2 Gmail cleanup migration applied');
