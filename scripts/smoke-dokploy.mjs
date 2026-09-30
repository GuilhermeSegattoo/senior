import assert from 'node:assert/strict';
export async function smokeLogin(base, password, origin, request = fetch) {
  const login = value => request(`${base}/api/auth`, {method:'POST', headers:{'Content-Type':'application/json', Origin:origin, 'X-Forwarded-For':'192.0.2.7'}, body:JSON.stringify({password:value})});
  const wrong = await login('deliberately-wrong-password');
  assert.equal(wrong.status,401,'Incorrect password must be refused');
  assert.equal(wrong.headers.get('set-cookie'),null,'Failure must not create a session');
  const correct = await login(password);
  assert.equal(correct.status,200,'Configured password must authenticate');
  assert.equal((await correct.json()).authenticated,true);
  const cookie = correct.headers.get('set-cookie') ?? '';
  assert.match(cookie,/(?:^|;\s*)Secure(?:;|$)/i);
  assert.match(cookie,/(?:^|;\s*)HttpOnly(?:;|$)/i);
  assert.match(cookie,/(?:^|;\s*)SameSite=Strict(?:;|$)/i);
  const session = await request(`${base}/api/auth`, {headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(session.status,200);
  assert.equal((await session.json()).authenticated,true,'Session must persist');
}
if (process.argv[1]?.endsWith('smoke-dokploy.mjs')) {
  await smokeLogin(process.argv[2] ?? 'http://127.0.0.1:3000', process.env.SENIOR_WEB_PASSWORD, `https://${process.env.SENIOR_DOMAIN}`);
  console.log('Compose login smoke passed: wrong password refused; authenticated cookie Secure/HttpOnly/SameSite=Strict.');
}
