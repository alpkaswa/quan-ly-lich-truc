interface Env { API:Fetcher }
export const onRequest:PagesFunction<Env>=async({request,env})=>{
  if(!env.API)return Response.json({error:'Chưa cấu hình kết nối Workers API.'},{status:503});
  const original=new URL(request.url);
  // Private service binding: backend has no public workers.dev endpoint.
  return env.API.fetch(new Request('https://api.internal'+original.pathname+original.search,{method:request.method,headers:request.headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
};
