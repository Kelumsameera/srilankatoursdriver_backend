/** Starts the real API against a dedicated temporary mongod. Never connects to the configured site database. */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';

export async function startAdminQa() {
 const directory=await mkdtemp(join(tmpdir(),'sltd-admin-functional-'));
 const port=27039;
 const mongo=spawn('C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe',['--dbpath',directory,'--port',String(port),'--bind_ip','127.0.0.1','--quiet'],{stdio:'ignore',windowsHide:true});
 let exited=false;mongo.on('exit',()=>{exited=true;});
 for(let i=0;i<100;i++){
  if(exited)throw new Error('Isolated mongod failed to start (port may be occupied)');
  const ready=await new Promise<boolean>(resolve=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
  if(ready)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 const password=randomBytes(24).toString('hex')+'aA9!';
 const email='admin-functional@example.test';
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:`mongodb://127.0.0.1:${port}/sltd_admin_functional_qa`,JWT_ACCESS_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),LOG_LEVEL:'silent',FRONTEND_URL:'http://localhost:3000',CORS_ORIGINS:'http://localhost:3000',API_PROXY_SECRET:'',REVALIDATE_SECRET:'',COOKIE_DOMAIN:'',COOKIE_SECURE:'false',COOKIE_SAMESITE:'lax',AUTH_RATE_LIMIT:'10000',SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',NOTIFY_EMAIL:'',TRANSLATION_PROVIDER:'none',TRANSLATION_API_KEY:'',CLOUDINARY_CLOUD_NAME:'',CLOUDINARY_API_KEY:'',CLOUDINARY_API_SECRET:'',TRIPADVISOR_API_KEY:''});
 const {connectDatabase,disconnectDatabase}=await import('../src/config/db.js');
 await connectDatabase();
 const {Role,User,SiteSetting,BrandSetting,Page}=await import('../src/models/index.js');
 const {default:bcrypt}=await import('bcryptjs');
 const role=await Role.create({name:'Super Admin',permissions:['*'],isSystem:true});
 await User.create({name:'Functional QA',email,passwordHash:await bcrypt.hash(password,12),role:role._id,status:'active'});
 await SiteSetting.create({key:'default',siteName:'Functional QA',businessName:'QA Test Business',currency:'USD'});
 await BrandSetting.create({key:'default'});
 await Page.create({slug:'home',title:'Home',status:'published',isSystem:true});
 const {createApp}=await import('../src/app.js');
 const server=await new Promise<ReturnType<ReturnType<typeof createApp>['listen']>>(resolve=>{const instance=createApp().listen(0,'127.0.0.1',()=>resolve(instance));});
 const address=server.address();if(!address||typeof address==='string')throw new Error('QA API did not bind');
 return {baseURL:`http://127.0.0.1:${address.port}/api`,email,password,models:await import('../src/models/index.js'),stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await disconnectDatabase();mongo.kill();}};
}
